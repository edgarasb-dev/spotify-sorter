import type { MouseEvent } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Mic, Music, Ban } from "lucide-react";
import type { PlaylistEntry } from "../types/spotify";
import { formatDuration, formatIsoDate } from "../utils/format";

interface TrackRowProps {
  entry: PlaylistEntry;
  draftIndex: number;
  isSelected: boolean;
  dragEnabled: boolean;
  isCollaborative: boolean;
  onToggleSelect: (instanceKey: string, shiftKey: boolean) => void;
}

export function TrackRow({
  entry,
  draftIndex,
  isSelected,
  dragEnabled,
  isCollaborative,
  onToggleSelect,
}: TrackRowProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: entry.instanceKey,
    disabled: !dragEnabled,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const hasMoved = draftIndex !== entry.originalIndex;
  const displayOrig = entry.originalIndex + 1;
  const displayDraft = draftIndex + 1;

  function handleCheckboxClick(e: MouseEvent<HTMLInputElement>) {
    e.stopPropagation();
    onToggleSelect(entry.instanceKey, e.shiftKey);
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      onClick={(e) => onToggleSelect(entry.instanceKey, e.shiftKey)}
      className={`grid h-14 grid-cols-[32px_28px_88px_minmax(220px,2.2fr)_minmax(140px,1.2fr)_100px_110px_64px] items-center gap-2 border-b border-zinc-800/60 px-3 text-xs transition-colors select-none ${
        isDragging
          ? "opacity-35 bg-zinc-800/70"
          : isSelected
            ? "bg-emerald-500/12 hover:bg-emerald-500/18"
            : "hover:bg-zinc-900/80"
      }`}
    >
      {/* Checkbox */}
      <div className="flex items-center justify-center">
        <input
          type="checkbox"
          checked={isSelected}
          onChange={() => undefined}
          onClick={handleCheckboxClick}
          aria-label={`Select ${entry.title}`}
          className="h-3.5 w-3.5 cursor-pointer rounded border-zinc-600 bg-zinc-950 accent-emerald-500"
        />
      </div>

      {/* Drag handle */}
      <button
        type="button"
        disabled={!dragEnabled}
        onClick={(e) => e.stopPropagation()}
        {...(dragEnabled ? attributes : {})}
        {...(dragEnabled ? listeners : {})}
        title={
          dragEnabled
            ? "Drag to reorder (drags all selected if multiple selected)"
            : "Clear search filter to drag-and-drop"
        }
        className={`flex h-7 w-7 items-center justify-center rounded-md ${
          dragEnabled
            ? "cursor-grab text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200 active:cursor-grabbing"
            : "cursor-not-allowed text-zinc-700"
        }`}
      >
        <GripVertical className="h-4 w-4" />
      </button>

      {/* Before -> After position */}
      <div className="font-mono text-[11px]">
        {hasMoved ? (
          <span className="inline-flex items-center gap-1 rounded-md bg-amber-500/15 px-1.5 py-0.5 font-medium text-amber-300 ring-1 ring-amber-500/30">
            <span>#{displayOrig}</span>
            <span>→</span>
            <span>#{displayDraft}</span>
          </span>
        ) : (
          <span className="text-zinc-500">#{displayDraft}</span>
        )}
      </div>

      {/* Artwork + Title + Artist + Badges */}
      <div className="flex min-w-0 items-center gap-2.5">
        {entry.artworkUrl ? (
          <img
            src={entry.artworkUrl}
            alt=""
            loading="lazy"
            className="h-9 w-9 shrink-0 rounded bg-zinc-800 object-cover"
          />
        ) : (
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded bg-zinc-800 text-zinc-500">
            {entry.kind === "episode" ? (
              <Mic className="h-4 w-4" />
            ) : entry.kind === "unavailable" ? (
              <Ban className="h-4 w-4" />
            ) : (
              <Music className="h-4 w-4" />
            )}
          </div>
        )}

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="truncate font-medium text-zinc-100">
              {entry.title}
            </span>
            {entry.explicit && (
              <span
                title="Explicit"
                className="shrink-0 rounded bg-zinc-700 px-1 py-0.2 text-[9px] font-bold text-zinc-200"
              >
                E
              </span>
            )}
            {entry.isLocal && (
              <span className="shrink-0 rounded bg-sky-500/20 px-1.5 py-0.2 text-[9px] font-semibold text-sky-300">
                Local
              </span>
            )}
            {entry.kind === "episode" && (
              <span className="shrink-0 rounded bg-purple-500/20 px-1.5 py-0.2 text-[9px] font-semibold text-purple-300">
                Podcast
              </span>
            )}
            {entry.kind === "unavailable" && (
              <span className="shrink-0 rounded bg-red-500/20 px-1.5 py-0.2 text-[9px] font-semibold text-red-300">
                Unavailable
              </span>
            )}
          </div>
          <div className="truncate text-[11px] text-zinc-400">
            {entry.artists.length > 0 ? entry.artists.join(", ") : "—"}
          </div>
        </div>
      </div>

      {/* Album / Show */}
      <div className="truncate text-zinc-300">
        {entry.albumOrShow || "—"}
      </div>

      {/* Release date */}
      <div className="font-mono text-[11px] text-zinc-400">
        {entry.releaseDateRaw || "—"}
      </div>

      {/* Added At + optional Added By */}
      <div className="min-w-0">
        <div className="font-mono text-[11px] text-zinc-400">
          {formatIsoDate(entry.addedAt)}
        </div>
        {isCollaborative && entry.addedById && (
          <div className="truncate text-[10px] text-zinc-500">
            by {entry.addedById}
          </div>
        )}
      </div>

      {/* Duration */}
      <div className="text-right font-mono text-[11px] text-zinc-400">
        {formatDuration(entry.durationMs)}
      </div>
    </div>
  );
}
