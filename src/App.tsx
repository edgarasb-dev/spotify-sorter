import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle } from "lucide-react";
import {
  deleteVpsPlaylistBackup,
  disconnectVpsAuth,
  fetchAutoSortStatus,
  fetchVpsPlaylistBackups,
  saveAutoSortRule,
  triggerAutoSortRunNow,
} from "./api/autoSortApi";
import {
  fetchAllPlaylistItems,
  fetchAllPlaylists,
} from "./api/playlists";
import {
  SnapshotConflictError,
  commitPlaylistReorder,
} from "./api/reorderRunner";
import { AuthExpiredError, resyncSessionToVps } from "./auth/spotifyAuth";
import { AuthGuard } from "./components/AuthGuard";
import { AutoSortModal } from "./components/AutoSortModal";
import { BackupDrawer } from "./components/BackupDrawer";
import { CommitModal, type CommitModalState } from "./components/CommitModal";
import { MultiRuleModal } from "./components/MultiRuleModal";
import { PlaylistSidebar } from "./components/PlaylistSidebar";
import { SortToolbar, type SortPresetId } from "./components/SortToolbar";
import { TrackTable } from "./components/TrackTable";
import {
  moveSelectionStep,
  moveSelectionToEdge,
  moveSelectionToPosition,
  sortEntries,
  swapTwoEntries,
} from "./sorter/comparators";
import { planReorderMoves } from "./sorter/diffPlanner";
import { applySortPreset } from "./sorter/presets";
import {
  createBackupSnapshot,
  deletePlaylistBackup,
  listPlaylistBackups,
  planRestoreFromBackup,
  savePlaylistBackup,
  serializeBackupSnapshot,
} from "./storage/backups";
import type {
  AutoSortStatusResponse,
  BackupSnapshot,
  MoveOp,
  NormalizedPlaylist,
  PlaylistEntry,
  SortRule,
  SpotifyUser,
} from "./types/spotify";

function triggerJsonDownload(filename: string, content: string): void {
  const blob = new Blob([content], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function Workspace({
  user,
  onLogout,
}: {
  user: SpotifyUser;
  onLogout: () => void;
}) {
  const [playlists, setPlaylists] = useState<NormalizedPlaylist[]>([]);
  const [playlistsLoading, setPlaylistsLoading] = useState(true);
  const [selectedPlaylistId, setSelectedPlaylistId] = useState<string | null>(
    null
  );

  const [liveEntries, setLiveEntries] = useState<PlaylistEntry[]>([]);
  const [draftEntries, setDraftEntries] = useState<PlaylistEntry[]>([]);
  const [itemsLoading, setItemsLoading] = useState(false);
  const [loadProgress, setLoadProgress] = useState<{
    loaded: number;
    total: number;
  } | null>(null);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);

  const [filterQuery, setFilterQuery] = useState("");
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const lastClickedKeyRef = useRef<string | null>(null);

  const [activeCustomRules, setActiveCustomRules] = useState<SortRule[] | null>(
    null
  );
  const [showMultiRuleModal, setShowMultiRuleModal] = useState(false);
  const [showBackupDrawer, setShowBackupDrawer] = useState(false);
  const [showAutoSortModal, setShowAutoSortModal] = useState(false);
  const [backups, setBackups] = useState<BackupSnapshot[]>([]);
  const [vpsBackups, setVpsBackups] = useState<BackupSnapshot[]>([]);
  const [autoSortStatus, setAutoSortStatus] =
    useState<AutoSortStatusResponse | null>(null);
  const [autoSortBusy, setAutoSortBusy] = useState(false);

  const [commitModalState, setCommitModalState] =
    useState<CommitModalState | null>(null);
  const commitAbortRef = useRef<AbortController | null>(null);

  const selectedPlaylist = useMemo(
    () => playlists.find((p) => p.id === selectedPlaylistId) ?? null,
    [playlists, selectedPlaylistId]
  );

  const handleApiError = useCallback(
    (err: unknown, fallbackMessage: string) => {
      if (err instanceof AuthExpiredError) {
        onLogout();
        return;
      }
      setErrorBanner(err instanceof Error ? err.message : fallbackMessage);
    },
    [onLogout]
  );

  const loadPlaylists = useCallback(async () => {
    setPlaylistsLoading(true);
    setErrorBanner(null);
    try {
      const list = await fetchAllPlaylists(user.id);
      setPlaylists(list);
    } catch (err) {
      handleApiError(err, "Failed to load playlists.");
    } finally {
      setPlaylistsLoading(false);
    }
  }, [user.id, handleApiError]);

  const refreshAutoSortStatus = useCallback(async () => {
    const status = await fetchAutoSortStatus();
    setAutoSortStatus(status);
    return status;
  }, []);

  useEffect(() => {
    void loadPlaylists();
    void refreshAutoSortStatus();
  }, [loadPlaylists, refreshAutoSortStatus]);

  const autoSortIds = useMemo(() => {
    const set = new Set<string>();
    for (const rule of autoSortStatus?.rules ?? []) {
      if (rule.enabled) set.add(rule.playlistId);
    }
    return set;
  }, [autoSortStatus]);

  const currentAutoSortRule = useMemo(() => {
    if (!selectedPlaylistId || !autoSortStatus) return null;
    return (
      autoSortStatus.rules.find((r) => r.playlistId === selectedPlaylistId) ??
      null
    );
  }, [autoSortStatus, selectedPlaylistId]);

  const loadPlaylistItems = useCallback(
    async (playlistId: string) => {
      setItemsLoading(true);
      setLoadProgress(null);
      setErrorBanner(null);
      setSelectedKeys(new Set());
      lastClickedKeyRef.current = null;
      setActiveCustomRules(null);
      setFilterQuery("");

      try {
        const { items, total, snapshotId } = await fetchAllPlaylistItems(
          playlistId,
          (loaded, totalCount) => setLoadProgress({ loaded, total: totalCount })
        );
        setLiveEntries(items);
        setDraftEntries(items);
        setPlaylists((prev) =>
          prev.map((p) =>
            p.id === playlistId
              ? { ...p, snapshotId: snapshotId || p.snapshotId, totalItems: total }
              : p
          )
        );
        setBackups(listPlaylistBackups(playlistId));
        void fetchVpsPlaylistBackups(playlistId).then(setVpsBackups);
      } catch (err) {
        handleApiError(err, "Failed to load playlist items.");
      } finally {
        setItemsLoading(false);
        setLoadProgress(null);
      }
    },
    [handleApiError]
  );

  const visibleEntries = useMemo(() => {
    const q = filterQuery.trim().toLowerCase();
    const mapped = draftEntries.map((entry, draftIndex) => ({
      entry,
      draftIndex,
    }));
    if (!q) return mapped;

    return mapped.filter(({ entry }) => {
      return (
        entry.title.toLowerCase().includes(q) ||
        entry.primaryArtist.toLowerCase().includes(q) ||
        entry.artists.some((a) => a.toLowerCase().includes(q)) ||
        entry.albumOrShow.toLowerCase().includes(q)
      );
    });
  }, [draftEntries, filterQuery]);

  const movedItemCount = useMemo(() => {
    let moved = 0;
    for (let i = 0; i < draftEntries.length; i++) {
      if (draftEntries[i].originalIndex !== i) {
        moved += 1;
      }
    }
    return moved;
  }, [draftEntries]);

  const plannedMoves = useMemo<MoveOp[]>(() => {
    if (liveEntries.length === 0 || liveEntries.length !== draftEntries.length) {
      return [];
    }
    try {
      return planReorderMoves(
        liveEntries.map((e) => e.instanceKey),
        draftEntries.map((e) => e.instanceKey)
      );
    } catch {
      return [];
    }
  }, [liveEntries, draftEntries]);

  const hasUnsavedDraft = plannedMoves.length > 0;

  function handleSelectPlaylist(playlist: NormalizedPlaylist) {
    if (playlist.id === selectedPlaylistId) return;
    if (
      hasUnsavedDraft &&
      !window.confirm(
        "You have unsorted draft changes in the current playlist. Discard them and switch?"
      )
    ) {
      return;
    }
    setSelectedPlaylistId(playlist.id);
    void loadPlaylistItems(playlist.id);
  }

  function handleToggleSelect(instanceKey: string, shiftKey: boolean) {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (shiftKey && lastClickedKeyRef.current) {
        const idxA = visibleEntries.findIndex(
          (v) => v.entry.instanceKey === lastClickedKeyRef.current
        );
        const idxB = visibleEntries.findIndex(
          (v) => v.entry.instanceKey === instanceKey
        );
        if (idxA !== -1 && idxB !== -1) {
          const start = Math.min(idxA, idxB);
          const end = Math.max(idxA, idxB);
          for (let i = start; i <= end; i++) {
            next.add(visibleEntries[i].entry.instanceKey);
          }
          return next;
        }
      }

      if (next.has(instanceKey)) {
        next.delete(instanceKey);
      } else {
        next.add(instanceKey);
      }
      lastClickedKeyRef.current = instanceKey;
      return next;
    });
  }

  function handleSelectAllVisible() {
    setSelectedKeys(new Set(visibleEntries.map((v) => v.entry.instanceKey)));
  }

  function handleApplyPreset(preset: SortPresetId) {
    setActiveCustomRules(null);
    setDraftEntries((prev) => applySortPreset(prev, preset));
  }

  function handleApplyMultiRule(rules: SortRule[], keepAlbumsIntact: boolean) {
    setActiveCustomRules(rules);
    setDraftEntries((prev) => sortEntries(prev, rules, { keepAlbumsIntact }));
    setShowMultiRuleModal(false);
  }

  function handleMoveFilteredEdge(edge: "top" | "bottom") {
    const matchedKeys = new Set(
      visibleEntries.map((v) => v.entry.instanceKey)
    );
    setDraftEntries((prev) => moveSelectionToEdge(prev, matchedKeys, edge));
  }

  function handleExportJson() {
    if (!selectedPlaylist) return;
    const snap = createBackupSnapshot(
      selectedPlaylist.id,
      selectedPlaylist.name,
      selectedPlaylist.snapshotId,
      draftEntries,
      "manual_export"
    );
    const safeName = selectedPlaylist.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "");
    const dateStamp = new Date().toISOString().slice(0, 10);
    triggerJsonDownload(
      `${safeName || "playlist"}-${dateStamp}.json`,
      serializeBackupSnapshot(snap)
    );
  }

  function handleSaveManualBackup() {
    if (!selectedPlaylist) return;
    const snap = createBackupSnapshot(
      selectedPlaylist.id,
      selectedPlaylist.name,
      selectedPlaylist.snapshotId,
      liveEntries,
      "manual_export"
    );
    const updated = savePlaylistBackup(snap);
    setBackups(updated);
  }

  function handleDownloadBackup(snapshot: BackupSnapshot) {
    const safeName = snapshot.playlistName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-");
    triggerJsonDownload(
      `${safeName || "playlist"}-backup-${snapshot.createdAt.slice(0, 10)}.json`,
      serializeBackupSnapshot(snapshot)
    );
  }

  function handleDeleteBackup(backupId: string) {
    if (!selectedPlaylist) return;
    setBackups(deletePlaylistBackup(selectedPlaylist.id, backupId));
  }

  async function handleDeleteVpsBackup(backupId: string) {
    if (!selectedPlaylist) return;
    const next = await deleteVpsPlaylistBackup(selectedPlaylist.id, backupId);
    setVpsBackups(next);
  }

  async function handleSaveAutoSortRule(payload: {
    playlistName: string;
    preset: string;
    enabled: boolean;
  }) {
    if (!selectedPlaylist) return;
    setAutoSortBusy(true);
    try {
      const res = await saveAutoSortRule(selectedPlaylist.id, payload);
      setAutoSortStatus(res.status);
      if (payload.enabled && res.status.authConnected) {
        const afterRun = await triggerAutoSortRunNow();
        setAutoSortStatus(afterRun);
        const updatedBackups = await fetchVpsPlaylistBackups(selectedPlaylist.id);
        setVpsBackups(updatedBackups);
        if (!hasUnsavedDraft) {
          await loadPlaylistItems(selectedPlaylist.id);
        }
      }
      setShowAutoSortModal(false);
    } finally {
      setAutoSortBusy(false);
    }
  }

  async function handleRunAutoSortNow() {
    setAutoSortBusy(true);
    try {
      const status = await triggerAutoSortRunNow();
      setAutoSortStatus(status);
      if (selectedPlaylist) {
        const updatedBackups = await fetchVpsPlaylistBackups(selectedPlaylist.id);
        setVpsBackups(updatedBackups);
        if (!hasUnsavedDraft) {
          await loadPlaylistItems(selectedPlaylist.id);
        }
      }
    } finally {
      setAutoSortBusy(false);
    }
  }

  async function handleResyncVpsSession() {
    setAutoSortBusy(true);
    try {
      await resyncSessionToVps(user.id);
      await refreshAutoSortStatus();
    } finally {
      setAutoSortBusy(false);
    }
  }

  async function handleDisconnectVps() {
    setAutoSortBusy(true);
    try {
      const status = await disconnectVpsAuth();
      setAutoSortStatus(status);
    } finally {
      setAutoSortBusy(false);
    }
  }

  function handleRestoreBackup(snapshot: BackupSnapshot): string | null {
    const plan = planRestoreFromBackup(liveEntries, snapshot);
    setDraftEntries(plan.targetEntries);
    setActiveCustomRules(null);
    if (plan.status === "modified") {
      return `Playlist changed since backup (${plan.missingFromLive} removed, ${plan.addedSinceBackup} added). Matched ${plan.matchedCount} items in backup order with new items placed at the bottom.`;
    }
    return null;
  }

  function openCommitModal() {
    if (!selectedPlaylist || plannedMoves.length === 0) return;
    setCommitModalState({
      stage: "confirm",
      movedCount: movedItemCount,
      totalMoves: plannedMoves.length,
    });
  }

  async function executeCommit() {
    if (!selectedPlaylist || plannedMoves.length === 0) return;
    const abortController = new AbortController();
    commitAbortRef.current = abortController;
    let lastCompletedMoves = 0;

    setCommitModalState({
      stage: "running",
      progress: {
        completedMoves: 0,
        totalMoves: plannedMoves.length,
        rateLimitWaitSeconds: null,
        phase: "checking",
      },
    });

    try {
      const result = await commitPlaylistReorder({
        playlistId: selectedPlaylist.id,
        playlistName: selectedPlaylist.name,
        expectedSnapshotId: selectedPlaylist.snapshotId,
        currentEntries: liveEntries,
        targetEntries: draftEntries,
        moves: plannedMoves,
        signal: abortController.signal,
        onProgress: (progress) => {
          lastCompletedMoves = progress.completedMoves;
          setCommitModalState({ stage: "running", progress });
        },
      });

      setLiveEntries(result.liveItems);
      setDraftEntries(result.liveItems);
      setSelectedKeys(new Set());
      setActiveCustomRules(null);
      setPlaylists((prev) =>
        prev.map((p) =>
          p.id === selectedPlaylist.id
            ? {
                ...p,
                snapshotId: result.snapshotId,
                totalItems: result.liveItems.length,
              }
            : p
        )
      );
      setBackups(listPlaylistBackups(selectedPlaylist.id));
      setCommitModalState({
        stage: "done",
        verified: result.verified,
        completedMoves: result.completedMoves,
        snapshotId: result.snapshotId,
      });
    } catch (err) {
      if (err instanceof AuthExpiredError) {
        setCommitModalState(null);
        onLogout();
        return;
      }
      if (err instanceof DOMException && err.name === "AbortError") {
        setCommitModalState({
          stage: "error",
          message:
            "Commit cancelled between moves. Reload the playlist to see its exact current order on Spotify.",
          isConflict: false,
          completedMoves: lastCompletedMoves,
        });
        return;
      }
      if (err instanceof SnapshotConflictError) {
        setCommitModalState({
          stage: "error",
          message: err.message,
          isConflict: true,
          completedMoves: err.completedMoves,
        });
        return;
      }
      setCommitModalState({
        stage: "error",
        message: err instanceof Error ? err.message : "Commit failed.",
        isConflict: false,
        completedMoves: lastCompletedMoves,
      });
    } finally {
      commitAbortRef.current = null;
    }
  }

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-zinc-950 text-zinc-100">
      <PlaylistSidebar
        playlists={playlists}
        selectedId={selectedPlaylistId}
        autoSortIds={autoSortIds}
        loading={playlistsLoading}
        onSelect={handleSelectPlaylist}
        onRefresh={() => void loadPlaylists()}
      />

      <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <SortToolbar
          user={user}
          playlist={selectedPlaylist}
          itemCount={draftEntries.length}
          movedItemCount={movedItemCount}
          apiMoveCount={plannedMoves.length}
          selectedCount={selectedKeys.size}
          filteredCount={visibleEntries.length}
          filterQuery={filterQuery}
          canApply={Boolean(
            selectedPlaylist?.editable && hasUnsavedDraft && !itemsLoading
          )}
          hasUnsavedDraft={hasUnsavedDraft}
          backupCount={backups.length + vpsBackups.length}
          autoSortAvailable={Boolean(autoSortStatus?.available)}
          autoSortEnabled={Boolean(currentAutoSortRule?.enabled)}
          onFilterChange={setFilterQuery}
          onApplyPreset={handleApplyPreset}
          onOpenMultiRule={() => setShowMultiRuleModal(true)}
          onResetDraft={() => {
            setDraftEntries(liveEntries);
            setActiveCustomRules(null);
          }}
          onExportJson={handleExportJson}
          onOpenBackups={() => {
            if (selectedPlaylist && autoSortStatus?.available) {
              void fetchVpsPlaylistBackups(selectedPlaylist.id).then(
                setVpsBackups
              );
            }
            setShowBackupDrawer(true);
          }}
          onOpenAutoSort={() => {
            void refreshAutoSortStatus();
            setShowAutoSortModal(true);
          }}
          onApplyToSpotify={openCommitModal}
          onLogout={onLogout}
          onSelectAllVisible={handleSelectAllVisible}
          onClearSelection={() => setSelectedKeys(new Set())}
          onMoveSelectionEdge={(edge) =>
            setDraftEntries((prev) =>
              moveSelectionToEdge(prev, selectedKeys, edge)
            )
          }
          onMoveSelectionStep={(dir) =>
            setDraftEntries((prev) =>
              moveSelectionStep(prev, selectedKeys, dir)
            )
          }
          onMoveSelectionToPosition={(pos) =>
            setDraftEntries((prev) =>
              moveSelectionToPosition(prev, selectedKeys, pos)
            )
          }
          onSwapTwoSelected={() => {
            const keys = Array.from(selectedKeys);
            if (keys.length === 2) {
              setDraftEntries((prev) => swapTwoEntries(prev, keys[0], keys[1]));
            }
          }}
          onMoveFilteredEdge={handleMoveFilteredEdge}
          activeCustomRules={activeCustomRules}
        />

        {errorBanner && (
          <div className="mx-5 mt-3 flex items-center justify-between gap-2 rounded-xl border border-red-500/40 bg-red-500/10 px-3.5 py-2 text-xs text-red-200">
            <div className="flex items-center gap-2">
              <AlertCircle className="h-4 w-4 shrink-0 text-red-400" />
              <span>{errorBanner}</span>
            </div>
            <button
              type="button"
              onClick={() => setErrorBanner(null)}
              className="text-red-300 hover:text-white"
            >
              Dismiss
            </button>
          </div>
        )}

        {!selectedPlaylist ? (
          <div className="flex flex-1 flex-col items-center justify-center p-8 text-center text-zinc-500">
            <p className="text-sm font-medium text-zinc-300">
              Choose an owned or collaborative playlist from the sidebar
            </p>
            <p className="mt-1 max-w-md text-xs text-zinc-500">
              Sort, mix, drag-and-drop, and preview exact move plans locally
              before permanently writing Spotify&apos;s Custom Order (preserving all{" "}
              <code>added_at</code> dates).
            </p>
          </div>
        ) : (
          <TrackTable
            entries={draftEntries}
            visibleEntries={visibleEntries}
            loading={itemsLoading}
            loadProgress={loadProgress}
            isFiltering={filterQuery.trim().length > 0}
            isCollaborative={selectedPlaylist.collaborative}
            selectedKeys={selectedKeys}
            onToggleSelect={handleToggleSelect}
            onReorder={(next) => {
              setActiveCustomRules(null);
              setDraftEntries(next);
            }}
          />
        )}
      </main>

      {showMultiRuleModal && (
        <MultiRuleModal
          initialRules={activeCustomRules ?? []}
          onClose={() => setShowMultiRuleModal(false)}
          onApply={handleApplyMultiRule}
        />
      )}

      {showBackupDrawer && selectedPlaylist && (
        <BackupDrawer
          playlistId={selectedPlaylist.id}
          playlistName={selectedPlaylist.name}
          backups={backups}
          vpsBackups={vpsBackups}
          autoSortAvailable={Boolean(autoSortStatus?.available)}
          onClose={() => setShowBackupDrawer(false)}
          onSaveManualBackup={handleSaveManualBackup}
          onDownloadBackup={handleDownloadBackup}
          onDeleteBackup={handleDeleteBackup}
          onDeleteVpsBackup={handleDeleteVpsBackup}
          onRestoreBackup={handleRestoreBackup}
        />
      )}

      {showAutoSortModal && selectedPlaylist && autoSortStatus && (
        <AutoSortModal
          playlist={selectedPlaylist}
          status={autoSortStatus}
          currentRule={currentAutoSortRule}
          busy={autoSortBusy}
          onSaveRule={handleSaveAutoSortRule}
          onRunNow={handleRunAutoSortNow}
          onResyncSession={handleResyncVpsSession}
          onDisconnectVps={handleDisconnectVps}
          onClose={() => setShowAutoSortModal(false)}
        />
      )}

      {commitModalState && selectedPlaylist && (
        <CommitModal
          playlistName={selectedPlaylist.name}
          state={commitModalState}
          moves={plannedMoves}
          onConfirm={() => void executeCommit()}
          onCancelRunning={() => commitAbortRef.current?.abort()}
          onReloadPlaylist={() => {
            setCommitModalState(null);
            void loadPlaylistItems(selectedPlaylist.id);
          }}
          onClose={() => setCommitModalState(null)}
        />
      )}
    </div>
  );
}

export function App() {
  return (
    <AuthGuard>
      {({ user, onLogout }) => <Workspace user={user} onLogout={onLogout} />}
    </AuthGuard>
  );
}

export default App;
