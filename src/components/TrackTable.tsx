import { useMemo, useRef, useState } from "react";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { restrictToVerticalAxis } from "@dnd-kit/modifiers";
import {
  defaultRangeExtractor,
  useVirtualizer,
  type Range,
} from "@tanstack/react-virtual";
import { GripVertical, Loader2 } from "lucide-react";
import type { PlaylistEntry } from "../types/spotify";
import { formatDuration } from "../utils/format";
import { TrackRow } from "./TrackRow";

const ROW_HEIGHT = 56;
const VIRTUALIZE_THRESHOLD = 300;

interface TrackTableProps {
  entries: PlaylistEntry[];
  visibleEntries: Array<{ entry: PlaylistEntry; draftIndex: number }>;
  loading: boolean;
  loadProgress: { loaded: number; total: number } | null;
  isFiltering: boolean;
  isCollaborative: boolean;
  selectedKeys: ReadonlySet<string>;
  onToggleSelect: (instanceKey: string, shiftKey: boolean) => void;
  onReorder: (nextEntries: PlaylistEntry[]) => void;
}

export function TrackTable({
  entries,
  visibleEntries,
  loading,
  loadProgress,
  isFiltering,
  isCollaborative,
  selectedKeys,
  onToggleSelect,
  onReorder,
}: TrackTableProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [activeKey, setActiveKey] = useState<string | null>(null);

  const dragEnabled = !isFiltering && entries.length > 1;
  const shouldVirtualize = !isFiltering && visibleEntries.length > VIRTUALIZE_THRESHOLD;

  const activeEntry = useMemo(
    () => (activeKey ? entries.find((e) => e.instanceKey === activeKey) ?? null : null),
    [activeKey, entries]
  );
  const activeDragIndex = useMemo(
    () => (activeKey ? entries.findIndex((e) => e.instanceKey === activeKey) : -1),
    [activeKey, entries]
  );

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 4 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const virtualizer = useVirtualizer({
    count: visibleEntries.length,
    getScrollElement: () => scrollContainerRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 10,
    enabled: shouldVirtualize,
    rangeExtractor: (range: Range) => {
      const base = defaultRangeExtractor(range);
      if (
        activeDragIndex >= 0 &&
        activeDragIndex < visibleEntries.length &&
        !base.includes(activeDragIndex)
      ) {
        return [...base, activeDragIndex].sort((a, b) => a - b);
      }
      return base;
    },
  });

  function handleDragStart(event: DragStartEvent) {
    setActiveKey(String(event.active.id));
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    setActiveKey(null);
    if (!over || active.id === over.id) return;

    const draggedKey = String(active.id);
    const overKey = String(over.id);

    const oldIndex = entries.findIndex((e) => e.instanceKey === draggedKey);
    const newIndex = entries.findIndex((e) => e.instanceKey === overKey);
    if (oldIndex === -1 || newIndex === -1) return;

    // Multi-drag: if dragged row is part of a multi-selection, move the entire selection block.
    if (selectedKeys.has(draggedKey) && selectedKeys.size > 1) {
      if (selectedKeys.has(overKey)) return;

      const selectedBlock = entries.filter((e) => selectedKeys.has(e.instanceKey));
      const remaining = entries.filter((e) => !selectedKeys.has(e.instanceKey));
      const overRemainingIdx = remaining.findIndex(
        (e) => e.instanceKey === overKey
      );
      if (overRemainingIdx === -1) return;

      const insertIdx =
        oldIndex < newIndex ? overRemainingIdx + 1 : overRemainingIdx;
      const next = [...remaining];
      next.splice(insertIdx, 0, ...selectedBlock);
      onReorder(next);
      return;
    }

    onReorder(arrayMove(entries, oldIndex, newIndex));
  }

  if (loading) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 text-sm text-zinc-400">
        <Loader2 className="h-6 w-6 animate-spin text-emerald-500" />
        <p>
          Loading playlist items
          {loadProgress && loadProgress.total > 0
            ? ` (${loadProgress.loaded} / ${loadProgress.total})`
            : "…"}
        </p>
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center p-8 text-sm text-zinc-500">
        This playlist is empty.
      </div>
    );
  }

  const itemIds = visibleEntries.map((v) => v.entry.instanceKey);
  const draggingMultiCount =
    activeKey && selectedKeys.has(activeKey) && selectedKeys.size > 1
      ? selectedKeys.size
      : 1;

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      {/* Table column header */}
      <div className="grid grid-cols-[32px_28px_88px_minmax(220px,2.2fr)_minmax(140px,1.2fr)_100px_110px_64px] items-center gap-2 border-b border-zinc-800 bg-zinc-950/90 px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
        <div />
        <div />
        <div>Order</div>
        <div>Title / Artist</div>
        <div>Album / Show</div>
        <div>Released</div>
        <div>Added</div>
        <div className="text-right">Time</div>
      </div>

      {/* Scrollable track list */}
      <div ref={scrollContainerRef} className="min-h-0 flex-1 overflow-y-auto overflow-x-auto">
        {visibleEntries.length === 0 ? (
          <div className="p-8 text-center text-xs text-zinc-500">
            No tracks match your search filter.
          </div>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            modifiers={[restrictToVerticalAxis]}
            onDragStart={handleDragStart}
            onDragCancel={() => setActiveKey(null)}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={itemIds}
              strategy={verticalListSortingStrategy}
            >
              {shouldVirtualize ? (
                <div
                  style={{
                    height: `${virtualizer.getTotalSize()}px`,
                    position: "relative",
                    width: "100%",
                  }}
                >
                  {virtualizer.getVirtualItems().map((virtualRow) => {
                    const row = visibleEntries[virtualRow.index];
                    return (
                      <div
                        key={row.entry.instanceKey}
                        style={{
                          position: "absolute",
                          top: 0,
                          left: 0,
                          width: "100%",
                          height: `${virtualRow.size}px`,
                          transform: `translateY(${virtualRow.start}px)`,
                        }}
                      >
                        <TrackRow
                          entry={row.entry}
                          draftIndex={row.draftIndex}
                          isSelected={selectedKeys.has(row.entry.instanceKey)}
                          dragEnabled={dragEnabled}
                          isCollaborative={isCollaborative}
                          onToggleSelect={onToggleSelect}
                        />
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div>
                  {visibleEntries.map(({ entry, draftIndex }) => (
                    <TrackRow
                      key={entry.instanceKey}
                      entry={entry}
                      draftIndex={draftIndex}
                      isSelected={selectedKeys.has(entry.instanceKey)}
                      dragEnabled={dragEnabled}
                      isCollaborative={isCollaborative}
                      onToggleSelect={onToggleSelect}
                    />
                  ))}
                </div>
              )}
            </SortableContext>

            <DragOverlay>
              {activeEntry ? (
                <div className="flex items-center gap-3 rounded-xl border border-emerald-500/50 bg-zinc-900/95 px-3 py-2 text-xs text-white shadow-2xl">
                  <GripVertical className="h-4 w-4 text-emerald-400" />
                  <div className="min-w-0">
                    <div className="truncate font-semibold">
                      {draggingMultiCount > 1
                        ? `Moving ${draggingMultiCount} selected items`
                        : activeEntry.title}
                    </div>
                    <div className="truncate text-[11px] text-zinc-400">
                      {draggingMultiCount > 1
                        ? `Anchored at "${activeEntry.title}"`
                        : `${activeEntry.primaryArtist || "—"} · ${formatDuration(activeEntry.durationMs)}`}
                    </div>
                  </div>
                </div>
              ) : null}
            </DragOverlay>
          </DndContext>
        )}
      </div>
    </div>
  );
}
