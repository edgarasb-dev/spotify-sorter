import { AlertTriangle, CheckCircle2, Clock, Loader2, X } from "lucide-react";
import type { ReorderProgress } from "../api/reorderRunner";
import type { MoveOp } from "../types/spotify";

export type CommitModalState =
  | { stage: "confirm"; movedCount: number; totalMoves: number }
  | { stage: "running"; progress: ReorderProgress }
  | {
      stage: "done";
      verified: boolean;
      completedMoves: number;
      snapshotId: string;
    }
  | { stage: "error"; message: string; isConflict: boolean; completedMoves: number };

interface CommitModalProps {
  playlistName: string;
  state: CommitModalState;
  moves: MoveOp[];
  onConfirm: () => void;
  onCancelRunning: () => void;
  onReloadPlaylist: () => void;
  onClose: () => void;
}

export function CommitModal({
  playlistName,
  state,
  moves,
  onConfirm,
  onCancelRunning,
  onReloadPlaylist,
  onClose,
}: CommitModalProps) {
  const canDismiss = state.stage !== "running";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-zinc-800 bg-zinc-900 p-6 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-base font-semibold text-white">
            Apply Reorder to Spotify
          </h3>
          {canDismiss && (
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-1 text-zinc-400 hover:bg-zinc-800 hover:text-white"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {state.stage === "confirm" && (
          <div className="space-y-4">
            <p className="text-xs leading-relaxed text-zinc-300">
              You are about to permanently update{" "}
              <strong className="text-white">{playlistName}</strong> on Spotify
              using{" "}
              <strong className="text-emerald-400">
                {state.totalMoves} sequential reorder{" "}
                {state.totalMoves === 1 ? "call" : "calls"}
              </strong>{" "}
              ({state.movedCount} items changing position).
            </p>
            <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-200">
              Original <code>added_at</code> timestamps are preserved, and an
              automatic pre-sort backup will be saved in this browser first.
            </div>
            {moves.length <= 5 && (
              <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-2.5 font-mono text-[11px] text-zinc-400">
                {moves.map((m, i) => (
                  <div key={i}>
                    #{i + 1}: start={m.range_start} len={m.range_length} → before{" "}
                    {m.insert_before}
                  </div>
                ))}
              </div>
            )}
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg border border-zinc-700 px-3.5 py-2 text-xs font-medium text-zinc-300 hover:bg-zinc-800"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={onConfirm}
                className="rounded-lg bg-emerald-500 px-4 py-2 text-xs font-semibold text-zinc-950 hover:bg-emerald-400"
              >
                Apply Permanently
              </button>
            </div>
          </div>
        )}

        {state.stage === "running" && (
          <div className="space-y-4">
            <div className="flex items-center gap-2.5 text-sm text-zinc-200">
              <Loader2 className="h-4 w-4 animate-spin text-emerald-400" />
              <span>
                {state.progress.phase === "checking"
                  ? "Checking live Spotify snapshot…"
                  : state.progress.phase === "verifying"
                    ? "Verifying final order on Spotify…"
                    : `Applying step ${state.progress.completedMoves} of ${state.progress.totalMoves}…`}
              </span>
            </div>

            <div className="h-2.5 w-full overflow-hidden rounded-full bg-zinc-800">
              <div
                className="h-full rounded-full bg-emerald-500 transition-all duration-200"
                style={{
                  width: `${Math.round(
                    (state.progress.completedMoves /
                      Math.max(1, state.progress.totalMoves)) *
                      100
                  )}%`,
                }}
              />
            </div>

            {state.progress.currentMove && (
              <p className="font-mono text-[11px] text-zinc-400">
                PUT range_start={state.progress.currentMove.range_start}{" "}
                range_length={state.progress.currentMove.range_length}{" "}
                insert_before={state.progress.currentMove.insert_before}
              </p>
            )}

            {state.progress.rateLimitWaitSeconds !== null && (
              <div className="flex items-center gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-200">
                <Clock className="h-4 w-4 shrink-0 text-amber-400" />
                <span>
                  Spotify rate limit (429) hit — waiting{" "}
                  <strong>{state.progress.rateLimitWaitSeconds}s</strong> before
                  resuming…
                </span>
              </div>
            )}

            <div className="flex justify-end pt-1">
              <button
                type="button"
                onClick={onCancelRunning}
                className="rounded-lg border border-red-500/40 bg-red-500/10 px-3.5 py-2 text-xs font-medium text-red-200 hover:bg-red-500/20"
              >
                Stop After Current Step
              </button>
            </div>
          </div>
        )}

        {state.stage === "done" && (
          <div className="space-y-4">
            <div className="flex items-start gap-2.5 rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-3.5 text-xs text-emerald-200">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
              <div>
                <p className="font-semibold text-emerald-100">
                  {state.verified
                    ? "Playlist updated and verified!"
                    : "Moves finished — live playlist refreshed."}
                </p>
                <p className="mt-1 text-emerald-200/80">
                  Completed {state.completedMoves} reorder steps. New snapshot:{" "}
                  <code>{state.snapshotId.slice(0, 12)}…</code>
                </p>
                {!state.verified && (
                  <p className="mt-1 text-amber-300">
                    Live items differed slightly from draft (possibly modified elsewhere
                    during commit); view has been synced to Spotify.
                  </p>
                )}
              </div>
            </div>

            <p className="text-[11px] text-zinc-400">
              Tip: Ensure your phone/TV playlist sort is set to{" "}
              <strong className="text-zinc-200">Custom order</strong> so every
              device displays this exact sequence.
            </p>

            <div className="flex justify-end">
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg bg-emerald-500 px-4 py-2 text-xs font-semibold text-zinc-950 hover:bg-emerald-400"
              >
                Done
              </button>
            </div>
          </div>
        )}

        {state.stage === "error" && (
          <div className="space-y-4">
            <div className="flex items-start gap-2.5 rounded-xl border border-red-500/40 bg-red-500/10 p-3.5 text-xs text-red-200">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />
              <div>
                <p className="font-semibold text-red-100">
                  {state.isConflict ? "Snapshot Conflict Detected" : "Commit Stopped"}
                </p>
                <p className="mt-1">{state.message}</p>
                {state.completedMoves > 0 && (
                  <p className="mt-1 text-zinc-300">
                    {state.completedMoves} step(s) were applied cleanly before stopping.
                  </p>
                )}
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg border border-zinc-700 px-3.5 py-2 text-xs font-medium text-zinc-300 hover:bg-zinc-800"
              >
                Close
              </button>
              <button
                type="button"
                onClick={onReloadPlaylist}
                className="rounded-lg bg-emerald-500 px-4 py-2 text-xs font-semibold text-zinc-950 hover:bg-emerald-400"
              >
                Reload Live Playlist
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
