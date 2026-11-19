import { useMemo, useState } from "react";
import { Lock, Music2, RefreshCw, Search, Users } from "lucide-react";
import type { NormalizedPlaylist } from "../types/spotify";

interface PlaylistSidebarProps {
  playlists: NormalizedPlaylist[];
  selectedId: string | null;
  autoSortIds: ReadonlySet<string>;
  loading: boolean;
  onSelect: (playlist: NormalizedPlaylist) => void;
  onRefresh: () => void;
}

export function PlaylistSidebar({
  playlists,
  selectedId,
  autoSortIds,
  loading,
  onSelect,
  onRefresh,
}: PlaylistSidebarProps) {
  const [query, setQuery] = useState("");
  const [editableOnly, setEditableOnly] = useState(true);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return playlists
      .filter((p) => (editableOnly ? p.editable : true))
      .filter((p) => (q ? p.name.toLowerCase().includes(q) : true))
      .sort((a, b) => {
        if (a.editable !== b.editable) return a.editable ? -1 : 1;
        return 0;
      });
  }, [playlists, query, editableOnly]);

  const editableCount = useMemo(
    () => playlists.filter((p) => p.editable).length,
    [playlists]
  );

  return (
    <aside className="flex h-full w-72 shrink-0 flex-col border-r border-zinc-800 bg-zinc-900/50">
      <div className="border-b border-zinc-800 p-4">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-white">Your Playlists</h2>
            <p className="text-[11px] text-zinc-400">
              {editableCount} editable · {playlists.length} total
            </p>
          </div>
          <button
            type="button"
            onClick={onRefresh}
            disabled={loading}
            title="Reload playlists"
            className="rounded-lg border border-zinc-700 bg-zinc-800/80 p-1.5 text-zinc-300 transition hover:bg-zinc-700 hover:text-white disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>

        <div className="relative mb-2.5">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 h-3.5 w-3.5 text-zinc-500" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter playlists…"
            className="w-full rounded-lg border border-zinc-700/80 bg-zinc-950 py-1.5 pl-8 pr-3 text-xs text-zinc-100 placeholder-zinc-500 focus:border-emerald-500 focus:outline-none"
          />
        </div>

        <label className="flex cursor-pointer items-center gap-2 text-[11px] text-zinc-400 select-none">
          <input
            type="checkbox"
            checked={editableOnly}
            onChange={(e) => setEditableOnly(e.target.checked)}
            className="h-3.5 w-3.5 rounded border-zinc-600 bg-zinc-900 accent-emerald-500"
          />
          Show editable only (owned &amp; collaborative)
        </label>
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {loading && playlists.length === 0 ? (
          <div className="p-4 text-center text-xs text-zinc-400">
            Loading playlists…
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-4 text-center text-xs text-zinc-500">
            No matching playlists.
          </div>
        ) : (
          filtered.map((pl) => {
            const isSelected = pl.id === selectedId;
            return (
              <button
                key={pl.id}
                type="button"
                disabled={!pl.editable}
                onClick={() => onSelect(pl)}
                className={`flex w-full items-center gap-2.5 rounded-xl p-2 text-left transition ${
                  !pl.editable
                    ? "cursor-not-allowed opacity-45"
                    : isSelected
                      ? "bg-emerald-500/15 ring-1 ring-emerald-500/40"
                      : "hover:bg-zinc-800/70"
                }`}
              >
                {pl.imageUrl ? (
                  <img
                    src={pl.imageUrl}
                    alt=""
                    loading="lazy"
                    className="h-10 w-10 shrink-0 rounded-lg object-cover bg-zinc-800"
                  />
                ) : (
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-zinc-800 text-zinc-500">
                    <Music2 className="h-4 w-4" />
                  </div>
                )}

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="truncate text-xs font-medium text-zinc-100">
                      {pl.name}
                    </span>
                    {autoSortIds.has(pl.id) && (
                      <span className="shrink-0 rounded bg-emerald-500/20 px-1.5 py-0.2 text-[9px] font-semibold text-emerald-300 ring-1 ring-emerald-500/30">
                        Auto
                      </span>
                    )}
                  </div>
                  <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-zinc-400">
                    <span>{pl.totalItems} items</span>
                    <span>·</span>
                    {!pl.editable ? (
                      <span className="inline-flex items-center gap-0.5 text-zinc-500">
                        <Lock className="h-2.5 w-2.5" />
                        Read-only
                      </span>
                    ) : pl.collaborative ? (
                      <span className="inline-flex items-center gap-0.5 text-sky-400">
                        <Users className="h-2.5 w-2.5" />
                        Collab
                      </span>
                    ) : (
                      <span className="text-emerald-400">Owner</span>
                    )}
                  </div>
                </div>
              </button>
            );
          })
        )}
      </div>
    </aside>
  );
}
