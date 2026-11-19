import { useState, type FormEvent } from "react";
import {
  ArrowDown,
  ArrowDownUp,
  ArrowUp,
  ArrowUpToLine,
  ArrowDownToLine,
  Bot,
  CheckCircle2,
  Download,
  History,
  LogOut,
  RotateCcw,
  Search,
  Shuffle,
  SlidersHorizontal,
  Sparkles,
  Upload,
} from "lucide-react";
import type { SortPresetId } from "../sorter/presets";
import type {
  NormalizedPlaylist,
  SortRule,
  SpotifyUser,
} from "../types/spotify";
import { shortSnapshotId } from "../utils/format";

export type { SortPresetId };

interface SortToolbarProps {
  user: SpotifyUser;
  playlist: NormalizedPlaylist | null;
  itemCount: number;
  movedItemCount: number;
  apiMoveCount: number;
  selectedCount: number;
  filteredCount: number;
  filterQuery: string;
  canApply: boolean;
  hasUnsavedDraft: boolean;
  backupCount: number;
  autoSortAvailable: boolean;
  autoSortEnabled: boolean;
  onFilterChange: (query: string) => void;
  onApplyPreset: (preset: SortPresetId) => void;
  onOpenMultiRule: () => void;
  onResetDraft: () => void;
  onExportJson: () => void;
  onOpenBackups: () => void;
  onOpenAutoSort: () => void;
  onApplyToSpotify: () => void;
  onLogout: () => void;
  onSelectAllVisible: () => void;
  onClearSelection: () => void;
  onMoveSelectionEdge: (edge: "top" | "bottom") => void;
  onMoveSelectionStep: (direction: "up" | "down") => void;
  onMoveSelectionToPosition: (position: number) => void;
  onSwapTwoSelected: () => void;
  onMoveFilteredEdge: (edge: "top" | "bottom") => void;
  activeCustomRules: SortRule[] | null;
}

export function SortToolbar({
  user,
  playlist,
  itemCount,
  movedItemCount,
  apiMoveCount,
  selectedCount,
  filteredCount,
  filterQuery,
  canApply,
  hasUnsavedDraft,
  backupCount,
  autoSortAvailable,
  autoSortEnabled,
  onFilterChange,
  onApplyPreset,
  onOpenMultiRule,
  onResetDraft,
  onExportJson,
  onOpenBackups,
  onOpenAutoSort,
  onApplyToSpotify,
  onLogout,
  onSelectAllVisible,
  onClearSelection,
  onMoveSelectionEdge,
  onMoveSelectionStep,
  onMoveSelectionToPosition,
  onSwapTwoSelected,
  onMoveFilteredEdge,
  activeCustomRules,
}: SortToolbarProps) {
  const [selectedPreset, setSelectedPreset] = useState<string>("");
  const [positionInput, setPositionInput] = useState("");

  function handlePresetSelect(value: string) {
    setSelectedPreset(value);
    if (!value) return;
    onApplyPreset(value as SortPresetId);
  }

  function handleMoveToPosSubmit(e: FormEvent) {
    e.preventDefault();
    const pos = Number.parseInt(positionInput, 10);
    if (!Number.isFinite(pos) || pos < 1) return;
    onMoveSelectionToPosition(pos);
    setPositionInput("");
  }

  const estimatedSeconds = Math.max(1, Math.ceil(apiMoveCount * 0.25));

  return (
    <header className="border-b border-zinc-800 bg-zinc-900/40 px-5 py-3.5">
      {/* Top header row */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2.5">
            <h1 className="truncate text-lg font-semibold text-white">
              {playlist ? playlist.name : "Select an editable playlist"}
            </h1>
            {playlist && (
              <span
                title={`Spotify snapshot_id: ${playlist.snapshotId}`}
                className="rounded-md border border-zinc-700/80 bg-zinc-900 px-2 py-0.5 font-mono text-[11px] text-zinc-400"
              >
                {itemCount} items · snap {shortSnapshotId(playlist.snapshotId)}
              </span>
            )}
          </div>
          {activeCustomRules && activeCustomRules.length > 0 && (
            <p className="mt-0.5 text-[11px] text-emerald-400">
              Custom rule:{" "}
              {activeCustomRules
                .map((r) => `${r.field} (${r.direction})`)
                .join(" -> ")}
            </p>
          )}
        </div>

        <div className="flex items-center gap-2.5">
          <span className="hidden text-xs text-zinc-400 sm:inline">
            Signed in as{" "}
            <strong className="font-medium text-zinc-200">
              {user.display_name || user.id}
            </strong>
          </span>
          <button
            type="button"
            onClick={onLogout}
            className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-700 bg-zinc-900 px-2.5 py-1.5 text-xs font-medium text-zinc-300 transition hover:bg-zinc-800 hover:text-white"
          >
            <LogOut className="h-3.5 w-3.5" />
            Log Out
          </button>
        </div>
      </div>

      {/* Controls row */}
      {playlist && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <select
            aria-label="Sort presets"
            value={selectedPreset}
            onChange={(e) => handlePresetSelect(e.target.value)}
            className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-1.5 text-xs text-zinc-100 focus:border-emerald-500 focus:outline-none"
          >
            <option value="">Sort Preset…</option>
            <optgroup label="Standard Sorts (All Tracks)">
              <option value="added_desc">Date Added (Newest First)</option>
              <option value="added_asc">Date Added (Oldest First)</option>
              <option value="title_asc">Title (A → Z, ignore The/A/An)</option>
              <option value="title_desc">Title (Z → A, ignore The/A/An)</option>
              <option value="artist_asc">Artist → Album → Track #</option>
              <option value="album_asc">Album → Disc # → Track #</option>
              <option value="release_desc">Release Date (Newest First)</option>
              <option value="release_asc">Release Date (Oldest First)</option>
              <option value="duration_asc">Duration (Shortest First)</option>
              <option value="duration_desc">Duration (Longest First)</option>
              <option value="added_by_asc">Added By (Collaborator ID)</option>
              <option value="explicit_first">Explicit First</option>
              <option value="clean_first">Clean First</option>
              <option value="reverse">Reverse Current Order</option>
            </optgroup>
            <optgroup label="Smart Mixes & Cleanup">
              <option value="smart_artist_spread">
                Smart Mix: Artist Spread (Anti-Clump)
              </option>
              <option value="smart_true_shuffle">
                Smart Mix: True Shuffle (Anti-Clump)
              </option>
              <option value="group_non_tracks_bottom">
                Move Podcasts / Local / Unavailable to Bottom
              </option>
            </optgroup>
          </select>

          <button
            type="button"
            onClick={onOpenMultiRule}
            className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-700 bg-zinc-800/80 px-2.5 py-1.5 text-xs font-medium text-zinc-200 transition hover:bg-zinc-700"
          >
            <SlidersHorizontal className="h-3.5 w-3.5 text-emerald-400" />
            Multi-Rule…
          </button>

          <button
            type="button"
            onClick={() => onApplyPreset("smart_artist_spread")}
            title="Space out repeated artists evenly across the playlist"
            className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-700 bg-zinc-800/80 px-2.5 py-1.5 text-xs font-medium text-zinc-200 transition hover:bg-zinc-700"
          >
            <Sparkles className="h-3.5 w-3.5 text-amber-400" />
            Spread Artists
          </button>

          <button
            type="button"
            onClick={() => onApplyPreset("smart_true_shuffle")}
            title="Anti-clump Fisher-Yates shuffle"
            className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-700 bg-zinc-800/80 px-2.5 py-1.5 text-xs font-medium text-zinc-200 transition hover:bg-zinc-700"
          >
            <Shuffle className="h-3.5 w-3.5 text-sky-400" />
            True Shuffle
          </button>

          <div className="relative ml-auto min-w-[200px] flex-1 max-w-xs">
            <Search className="pointer-events-none absolute left-2.5 top-2 h-3.5 w-3.5 text-zinc-500" />
            <input
              type="text"
              value={filterQuery}
              onChange={(e) => onFilterChange(e.target.value)}
              placeholder="Filter tracks in table…"
              className="w-full rounded-lg border border-zinc-700 bg-zinc-950 py-1.5 pl-8 pr-3 text-xs text-zinc-100 placeholder-zinc-500 focus:border-emerald-500 focus:outline-none"
            />
          </div>
        </div>
      )}

      {/* Search filter hint + quick action when filtering */}
      {playlist && filterQuery.trim() && (
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-sky-500/30 bg-sky-500/10 px-3 py-1.5 text-[11px] text-sky-200">
          <span>
            Showing <strong>{filteredCount}</strong> of {itemCount} tracks. Preset sorts apply to{" "}
            <strong>All Tracks</strong>; or move matching rows:
          </span>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => onMoveFilteredEdge("top")}
              className="rounded bg-sky-500/20 px-2 py-0.5 font-medium text-sky-100 hover:bg-sky-500/30"
            >
              Matches to Top
            </button>
            <button
              type="button"
              onClick={() => onMoveFilteredEdge("bottom")}
              className="rounded bg-sky-500/20 px-2 py-0.5 font-medium text-sky-100 hover:bg-sky-500/30"
            >
              Matches to Bottom
            </button>
          </div>
        </div>
      )}

      {/* Selection bulk-action bar */}
      {playlist && (
        <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 border-t border-zinc-800/80 pt-2.5">
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={onSelectAllVisible}
              className="rounded-md border border-zinc-700/80 bg-zinc-900 px-2 py-1 text-[11px] text-zinc-300 hover:bg-zinc-800"
            >
              Select {filterQuery.trim() ? `Filtered (${filteredCount})` : "All"}
            </button>

            {selectedCount > 0 && (
              <>
                <span className="px-1 text-[11px] font-medium text-emerald-400">
                  {selectedCount} selected
                </span>
                <button
                  type="button"
                  onClick={onClearSelection}
                  className="rounded-md px-1.5 py-1 text-[11px] text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
                >
                  Clear
                </button>
                <button
                  type="button"
                  onClick={() => onMoveSelectionEdge("top")}
                  className="inline-flex items-center gap-1 rounded-md border border-zinc-700 bg-zinc-800 px-2 py-1 text-[11px] text-zinc-200 hover:bg-zinc-700"
                >
                  <ArrowUpToLine className="h-3 w-3" />
                  Top
                </button>
                <button
                  type="button"
                  onClick={() => onMoveSelectionEdge("bottom")}
                  className="inline-flex items-center gap-1 rounded-md border border-zinc-700 bg-zinc-800 px-2 py-1 text-[11px] text-zinc-200 hover:bg-zinc-700"
                >
                  <ArrowDownToLine className="h-3 w-3" />
                  Bottom
                </button>
                <button
                  type="button"
                  onClick={() => onMoveSelectionStep("up")}
                  className="inline-flex items-center gap-1 rounded-md border border-zinc-700 bg-zinc-800 px-2 py-1 text-[11px] text-zinc-200 hover:bg-zinc-700"
                >
                  <ArrowUp className="h-3 w-3" />
                  Up
                </button>
                <button
                  type="button"
                  onClick={() => onMoveSelectionStep("down")}
                  className="inline-flex items-center gap-1 rounded-md border border-zinc-700 bg-zinc-800 px-2 py-1 text-[11px] text-zinc-200 hover:bg-zinc-700"
                >
                  <ArrowDown className="h-3 w-3" />
                  Down
                </button>
                {selectedCount === 2 && (
                  <button
                    type="button"
                    onClick={onSwapTwoSelected}
                    className="inline-flex items-center gap-1 rounded-md border border-zinc-700 bg-zinc-800 px-2 py-1 text-[11px] text-zinc-200 hover:bg-zinc-700"
                  >
                    <ArrowDownUp className="h-3 w-3" />
                    Swap 2
                  </button>
                )}
                <form
                  onSubmit={handleMoveToPosSubmit}
                  className="inline-flex items-center gap-1"
                >
                  <input
                    type="number"
                    min={1}
                    max={Math.max(1, itemCount)}
                    value={positionInput}
                    onChange={(e) => setPositionInput(e.target.value)}
                    placeholder="#Pos"
                    className="w-16 rounded-md border border-zinc-700 bg-zinc-950 px-2 py-1 text-[11px] text-zinc-100 placeholder-zinc-500 focus:border-emerald-500 focus:outline-none"
                  />
                  <button
                    type="submit"
                    className="rounded-md border border-zinc-700 bg-zinc-800 px-2 py-1 text-[11px] text-zinc-200 hover:bg-zinc-700"
                  >
                    Move
                  </button>
                </form>
              </>
            )}
          </div>

          {/* Right side: change summary & commit buttons */}
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium ${
                hasUnsavedDraft
                  ? "bg-amber-500/15 text-amber-300 ring-1 ring-amber-500/30"
                  : "bg-zinc-800 text-zinc-400"
              }`}
            >
              {hasUnsavedDraft ? (
                <>
                  {movedItemCount} items moved · {apiMoveCount} API{" "}
                  {apiMoveCount === 1 ? "call" : "calls"} (~{estimatedSeconds}s)
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-3 w-3 text-emerald-400" />
                  In sync with Spotify
                </>
              )}
            </span>

            {hasUnsavedDraft && (
              <button
                type="button"
                onClick={onResetDraft}
                className="inline-flex items-center gap-1 rounded-lg border border-zinc-700 bg-zinc-900 px-2.5 py-1.5 text-xs font-medium text-zinc-300 hover:bg-zinc-800"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Reset
              </button>
            )}

            <button
              type="button"
              onClick={onExportJson}
              title="Download JSON snapshot of current order"
              className="inline-flex items-center gap-1 rounded-lg border border-zinc-700 bg-zinc-900 px-2.5 py-1.5 text-xs font-medium text-zinc-300 hover:bg-zinc-800"
            >
              <Download className="h-3.5 w-3.5" />
              .json
            </button>

            {autoSortAvailable && (
              <button
                type="button"
                onClick={onOpenAutoSort}
                className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition ${
                  autoSortEnabled
                    ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25"
                    : "border-zinc-700 bg-zinc-900 text-zinc-300 hover:bg-zinc-800"
                }`}
              >
                <Bot className="h-3.5 w-3.5" />
                {autoSortEnabled ? "Auto: On" : "Auto-Sort"}
              </button>
            )}

            <button
              type="button"
              onClick={onOpenBackups}
              className="inline-flex items-center gap-1 rounded-lg border border-zinc-700 bg-zinc-900 px-2.5 py-1.5 text-xs font-medium text-zinc-300 hover:bg-zinc-800"
            >
              <History className="h-3.5 w-3.5" />
              Backups{backupCount > 0 ? ` (${backupCount})` : ""}
            </button>

            <button
              type="button"
              disabled={!canApply}
              onClick={onApplyToSpotify}
              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500 px-3.5 py-1.5 text-xs font-semibold text-zinc-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Upload className="h-3.5 w-3.5" />
              Apply to Spotify
            </button>
          </div>
        </div>
      )}
    </header>
  );
}
