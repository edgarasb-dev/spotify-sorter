import { useState, type FormEvent } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  RefreshCw,
  ShieldCheck,
  X,
} from "lucide-react";
import { AUTO_SORT_PRESETS } from "../sorter/presets";
import type {
  AutoSortPlaylistRule,
  AutoSortStatusResponse,
  NormalizedPlaylist,
} from "../types/spotify";
import { formatDateTime } from "../utils/format";

interface AutoSortModalProps {
  playlist: NormalizedPlaylist;
  status: AutoSortStatusResponse;
  currentRule: AutoSortPlaylistRule | null;
  busy: boolean;
  onSaveRule: (payload: {
    playlistName: string;
    preset: string;
    enabled: boolean;
  }) => Promise<void>;
  onRunNow: () => Promise<void>;
  onResyncSession: () => Promise<void>;
  onDisconnectVps: () => Promise<void>;
  onClose: () => void;
}

export function AutoSortModal({
  playlist,
  status,
  currentRule,
  busy,
  onSaveRule,
  onRunNow,
  onResyncSession,
  onDisconnectVps,
  onClose,
}: AutoSortModalProps) {
  const [enabled, setEnabled] = useState(currentRule?.enabled ?? false);
  const [preset, setPreset] = useState(currentRule?.preset ?? "added_desc");
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await onSaveRule({
        playlistName: playlist.name,
        preset,
        enabled,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save rule.");
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-2xl border border-zinc-800 bg-zinc-900 p-6 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h3 className="text-base font-semibold text-white">
              Automatic Background Sort (VPS)
            </h3>
            <p className="truncate text-xs text-zinc-400">{playlist.name}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-zinc-400 hover:bg-zinc-800 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* VPS connection status */}
        <div className="mb-4 rounded-xl border border-zinc-800 bg-zinc-950/70 p-3.5 text-xs">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              {status.authConnected ? (
                <CheckCircle2 className="h-4 w-4 text-emerald-400" />
              ) : (
                <AlertTriangle className="h-4 w-4 text-amber-400" />
              )}
              <span className="font-medium text-zinc-200">
                {status.authConnected
                  ? `VPS connected (${status.userId})`
                  : status.authStatus === "needs_reauth"
                    ? "VPS session expired — click Re-sync"
                    : "VPS session not synced"}
              </span>
            </div>

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                disabled={busy}
                onClick={() => void onResyncSession()}
                className="rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1 text-[11px] text-zinc-300 hover:bg-zinc-800 disabled:opacity-50"
              >
                Re-sync Token
              </button>
              {status.authConnected && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void onDisconnectVps()}
                  className="rounded-md border border-red-500/30 bg-red-500/10 px-2 py-1 text-[11px] text-red-300 hover:bg-red-500/20 disabled:opacity-50"
                >
                  Disconnect
                </button>
              )}
            </div>
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-zinc-400">
            <span>Checks every {Math.round(status.pollIntervalSeconds / 60)} min</span>
            <span>·</span>
            <span>
              Last check:{" "}
              {status.lastTickAt ? formatDateTime(status.lastTickAt) : "Never"}
            </span>
          </div>
          {status.lastTickError && (
            <p className="mt-1.5 text-[11px] text-red-300">
              {status.lastTickError}
            </p>
          )}
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <label className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-zinc-800 bg-zinc-950/60 p-3.5">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-zinc-600 accent-emerald-500"
            />
            <div>
              <div className="text-xs font-semibold text-zinc-100">
                Keep this playlist automatically sorted
              </div>
              <div className="mt-0.5 text-[11px] text-zinc-400">
                Uses 1 lightweight check per interval when unchanged; when you add
                songs on Spotify, moves them automatically while preserving{" "}
                <code>added_at</code>.
              </div>
            </div>
          </label>

          <div>
            <label
              htmlFor="auto-sort-preset"
              className="mb-1.5 block text-xs font-medium text-zinc-300"
            >
              Sort Rule
            </label>
            <select
              id="auto-sort-preset"
              value={preset}
              onChange={(e) => setPreset(e.target.value)}
              className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 text-xs text-zinc-100 focus:border-emerald-500 focus:outline-none"
            >
              {AUTO_SORT_PRESETS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-start gap-2 rounded-xl border border-emerald-500/25 bg-emerald-500/10 p-3 text-[11px] text-emerald-200">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
            <span>
              Before every automatic reorder, the VPS saves a pre-sort backup
              snapshot on disk (up to 20 per playlist), accessible anytime in{" "}
              <strong>Backups</strong>.
            </span>
          </div>

          {currentRule && (
            <div className="rounded-xl border border-zinc-800 bg-zinc-950/50 p-3 text-[11px] text-zinc-400 space-y-1">
              <div>
                Last auto-sort:{" "}
                {currentRule.lastSortedAt
                  ? `${formatDateTime(currentRule.lastSortedAt)} (${currentRule.lastMovesCount} API moves)`
                  : "Not run yet"}
              </div>
              {currentRule.lastError && (
                <div className="text-red-300">Error: {currentRule.lastError}</div>
              )}
            </div>
          )}

          {error && (
            <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-3 text-xs text-red-200">
              {error}
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
            <button
              type="button"
              disabled={busy || !status.authConnected}
              onClick={() => void onRunNow()}
              className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-xs font-medium text-zinc-200 hover:bg-zinc-700 disabled:opacity-40"
            >
              {busy ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5" />
              )}
              Check &amp; Sort Now
            </button>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg border border-zinc-700 px-3.5 py-2 text-xs font-medium text-zinc-300 hover:bg-zinc-800"
              >
                Close
              </button>
              <button
                type="submit"
                disabled={busy}
                className="rounded-lg bg-emerald-500 px-4 py-2 text-xs font-semibold text-zinc-950 hover:bg-emerald-400 disabled:opacity-50"
              >
                Save Auto-Sort
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
