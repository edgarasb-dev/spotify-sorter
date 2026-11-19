import { useRef, useState, type ChangeEvent } from "react";
import {
  AlertTriangle,
  Download,
  RotateCcw,
  Save,
  Server,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import type { BackupSnapshot } from "../types/spotify";
import { parseBackupSnapshotJson } from "../storage/backups";
import { formatDateTime, shortSnapshotId } from "../utils/format";

interface BackupDrawerProps {
  playlistId: string;
  playlistName: string;
  backups: BackupSnapshot[];
  vpsBackups: BackupSnapshot[];
  autoSortAvailable: boolean;
  onClose: () => void;
  onSaveManualBackup: () => void;
  onDownloadBackup: (snapshot: BackupSnapshot) => void;
  onDeleteBackup: (backupId: string) => void;
  onDeleteVpsBackup: (backupId: string) => Promise<void>;
  onRestoreBackup: (snapshot: BackupSnapshot) => string | null;
}

export function BackupDrawer({
  playlistId,
  playlistName,
  backups,
  vpsBackups,
  autoSortAvailable,
  onClose,
  onSaveManualBackup,
  onDownloadBackup,
  onDeleteBackup,
  onDeleteVpsBackup,
  onRestoreBackup,
}: BackupDrawerProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [feedback, setFeedback] = useState<{
    type: "info" | "warn" | "error";
    text: string;
  } | null>(null);

  async function handleImportFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    try {
      const text = await file.text();
      const snapshot = parseBackupSnapshotJson(text);
      if (snapshot.playlistId !== playlistId) {
        setFeedback({
          type: "error",
          text: `Backup belongs to playlist "${snapshot.playlistName}", not "${playlistName}".`,
        });
        return;
      }
      const warning = onRestoreBackup(snapshot);
      setFeedback(
        warning
          ? { type: "warn", text: warning }
          : {
              type: "info",
              text: "Imported backup loaded into draft preview. Click Apply to Spotify to commit.",
            }
      );
    } catch (err) {
      setFeedback({
        type: "error",
        text: err instanceof Error ? err.message : "Failed to parse backup JSON.",
      });
    }
  }

  function handleRestoreClick(snapshot: BackupSnapshot) {
    const warning = onRestoreBackup(snapshot);
    setFeedback(
      warning
        ? { type: "warn", text: warning }
        : {
            type: "info",
            text: "Backup loaded into draft preview. Review changes and click Apply to Spotify.",
          }
    );
  }

  function renderSnapshotCard(
    snap: BackupSnapshot,
    onDelete: (id: string) => void
  ) {
    const badgeClass =
      snap.reason === "auto_vps"
        ? "bg-emerald-500/15 text-emerald-300"
        : snap.reason === "auto_pre_commit"
          ? "bg-amber-500/15 text-amber-300"
          : "bg-sky-500/15 text-sky-300";

    const badgeLabel =
      snap.reason === "auto_vps"
        ? "Auto VPS"
        : snap.reason === "auto_pre_commit"
          ? "Pre-Commit"
          : "Manual";

    return (
      <div
        key={snap.id}
        className="rounded-xl border border-zinc-800 bg-zinc-950/70 p-3.5"
      >
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="flex items-center gap-2">
              <span
                className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${badgeClass}`}
              >
                {badgeLabel}
              </span>
              <span className="text-xs font-medium text-zinc-200">
                {snap.itemCount} items
              </span>
            </div>
            <div className="mt-1 text-[11px] text-zinc-400">
              {formatDateTime(snap.createdAt)}
            </div>
            <div className="mt-0.5 font-mono text-[10px] text-zinc-500">
              snap {shortSnapshotId(snap.snapshotId)}
            </div>
          </div>

          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => onDownloadBackup(snap)}
              title="Download JSON"
              className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
            >
              <Download className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => onDelete(snap.id)}
              title="Delete backup"
              className="rounded-lg p-1.5 text-zinc-500 hover:bg-zinc-800 hover:text-red-400"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        <button
          type="button"
          onClick={() => handleRestoreClick(snap)}
          className="mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-xs font-medium text-zinc-200 hover:bg-zinc-800 hover:text-white"
        >
          <RotateCcw className="h-3.5 w-3.5 text-emerald-400" />
          Load into Draft (Restore Order)
        </button>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/65 backdrop-blur-sm">
      <div className="flex h-full w-full max-w-md flex-col border-l border-zinc-800 bg-zinc-900 shadow-2xl">
        <div className="flex items-center justify-between border-b border-zinc-800 px-5 py-4">
          <div>
            <h3 className="text-sm font-semibold text-white">
              Backups &amp; Restore
            </h3>
            <p className="truncate text-[11px] text-zinc-400">{playlistName}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-zinc-400 hover:bg-zinc-800 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex flex-wrap gap-2 border-b border-zinc-800 px-5 py-3">
          <button
            type="button"
            onClick={() => {
              onSaveManualBackup();
              setFeedback({
                type: "info",
                text: "Manual backup snapshot saved to browser localStorage.",
              });
            }}
            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500/15 px-3 py-1.5 text-xs font-medium text-emerald-300 ring-1 ring-emerald-500/30 hover:bg-emerald-500/25"
          >
            <Save className="h-3.5 w-3.5" />
            Save Snapshot Now
          </button>

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-xs font-medium text-zinc-200 hover:bg-zinc-700"
          >
            <Upload className="h-3.5 w-3.5" />
            Import .json
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json,.json"
            onChange={handleImportFile}
            className="hidden"
          />
        </div>

        {feedback && (
          <div
            className={`mx-5 mt-3 flex items-start gap-2 rounded-xl border p-3 text-xs ${
              feedback.type === "error"
                ? "border-red-500/40 bg-red-500/10 text-red-200"
                : feedback.type === "warn"
                  ? "border-amber-500/40 bg-amber-500/10 text-amber-200"
                  : "border-emerald-500/40 bg-emerald-500/10 text-emerald-200"
            }`}
          >
            {feedback.type !== "info" && (
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            )}
            <span>{feedback.text}</span>
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {autoSortAvailable && (
            <section className="space-y-2.5">
              <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
                <Server className="h-3.5 w-3.5 text-emerald-400" />
                VPS Auto-Sort Backups ({vpsBackups.length})
              </div>
              {vpsBackups.length === 0 ? (
                <p className="rounded-xl border border-zinc-800/80 bg-zinc-950/40 p-3 text-xs text-zinc-500">
                  No VPS auto-sort backups yet. One is saved on disk before every
                  automatic reorder.
                </p>
              ) : (
                vpsBackups.map((snap) =>
                  renderSnapshotCard(snap, (id) => void onDeleteVpsBackup(id))
                )
              )}
            </section>
          )}

          <section className="space-y-2.5">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
              Browser Backups ({backups.length})
            </div>
            {backups.length === 0 ? (
              <p className="rounded-xl border border-zinc-800/80 bg-zinc-950/40 p-3 text-xs text-zinc-500">
                No browser backups for this playlist yet. An automatic snapshot
                is saved in localStorage every time you click Apply to Spotify.
              </p>
            ) : (
              backups.map((snap) => renderSnapshotCard(snap, onDeleteBackup))
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
