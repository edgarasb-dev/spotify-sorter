import { useState, type FormEvent } from "react";
import { Plus, Trash2, X } from "lucide-react";
import type { SortField, SortRule } from "../types/spotify";

const FIELD_OPTIONS: Array<{ value: SortField; label: string }> = [
  { value: "added_at", label: "Date Added" },
  { value: "artist", label: "Primary Artist / Show" },
  { value: "album", label: "Album / Show Name" },
  { value: "title", label: "Track / Episode Title" },
  { value: "release_date", label: "Release Date" },
  { value: "duration", label: "Duration" },
  { value: "added_by", label: "Added By (User ID)" },
  { value: "explicit", label: "Explicit / Clean" },
];

interface MultiRuleModalProps {
  initialRules: SortRule[];
  onClose: () => void;
  onApply: (rules: SortRule[], keepAlbumsIntact: boolean) => void;
}

export function MultiRuleModal({
  initialRules,
  onClose,
  onApply,
}: MultiRuleModalProps) {
  const [rules, setRules] = useState<SortRule[]>(
    initialRules.length > 0
      ? initialRules
      : [
          { field: "artist", direction: "asc", ignoreLeadingArticles: true },
          { field: "release_date", direction: "asc" },
          { field: "album", direction: "asc", ignoreLeadingArticles: true },
        ]
  );
  const [keepAlbumsIntact, setKeepAlbumsIntact] = useState(true);

  function updateRule(index: number, patch: Partial<SortRule>) {
    setRules((prev) =>
      prev.map((rule, idx) => (idx === index ? { ...rule, ...patch } : rule))
    );
  }

  function addRule() {
    if (rules.length >= 4) return;
    setRules((prev) => [
      ...prev,
      { field: "title", direction: "asc", ignoreLeadingArticles: true },
    ]);
  }

  function removeRule(index: number) {
    if (rules.length <= 1) return;
    setRules((prev) => prev.filter((_, idx) => idx !== index));
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    onApply(rules, keepAlbumsIntact);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-2xl border border-zinc-800 bg-zinc-900 p-6 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-base font-semibold text-white">
            Multi-Level Sort Builder
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-zinc-400 hover:bg-zinc-800 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          {rules.map((rule, idx) => {
            const supportsArticles =
              rule.field === "title" ||
              rule.field === "artist" ||
              rule.field === "album";

            return (
              <div
                key={idx}
                className="rounded-xl border border-zinc-800 bg-zinc-950/70 p-3"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="w-20 text-[11px] font-medium text-zinc-400">
                    {idx === 0
                      ? "Primary"
                      : idx === 1
                        ? "Secondary"
                        : idx === 2
                          ? "Tertiary"
                          : "4th Rule"}
                  </span>

                  <select
                    value={rule.field}
                    onChange={(e) =>
                      updateRule(idx, { field: e.target.value as SortField })
                    }
                    className="flex-1 rounded-lg border border-zinc-700 bg-zinc-900 px-2.5 py-1.5 text-xs text-zinc-100 focus:border-emerald-500 focus:outline-none"
                  >
                    {FIELD_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>

                  <select
                    value={rule.direction}
                    onChange={(e) =>
                      updateRule(idx, {
                        direction: e.target.value as "asc" | "desc",
                      })
                    }
                    className="rounded-lg border border-zinc-700 bg-zinc-900 px-2.5 py-1.5 text-xs text-zinc-100 focus:border-emerald-500 focus:outline-none"
                  >
                    <option value="asc">
                      {rule.field === "explicit" ? "Clean First" : "Ascending"}
                    </option>
                    <option value="desc">
                      {rule.field === "explicit" ? "Explicit First" : "Descending"}
                    </option>
                  </select>

                  {rules.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeRule(idx)}
                      title="Remove rule"
                      className="rounded-lg p-1.5 text-zinc-500 hover:bg-zinc-800 hover:text-red-400"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>

                {supportsArticles && (
                  <label className="mt-2 flex cursor-pointer items-center gap-2 pl-20 text-[11px] text-zinc-400">
                    <input
                      type="checkbox"
                      checked={Boolean(rule.ignoreLeadingArticles)}
                      onChange={(e) =>
                        updateRule(idx, {
                          ignoreLeadingArticles: e.target.checked,
                        })
                      }
                      className="h-3.5 w-3.5 rounded border-zinc-600 accent-emerald-500"
                    />
                    Ignore leading &quot;The &quot;, &quot;A &quot;, &quot;An &quot;
                  </label>
                )}
              </div>
            );
          })}

          {rules.length < 4 && (
            <button
              type="button"
              onClick={addRule}
              className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-zinc-700 px-3 py-1.5 text-xs text-zinc-300 hover:border-zinc-500 hover:text-white"
            >
              <Plus className="h-3.5 w-3.5" />
              Add tie-breaker level
            </button>
          )}

          <label className="flex cursor-pointer items-center gap-2 pt-2 text-xs text-zinc-300">
            <input
              type="checkbox"
              checked={keepAlbumsIntact}
              onChange={(e) => setKeepAlbumsIntact(e.target.checked)}
              className="h-3.5 w-3.5 rounded border-zinc-600 accent-emerald-500"
            />
            Keep albums intact (tie-break by Album → Disc # → Track #)
          </label>

          <div className="flex justify-end gap-2 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-zinc-700 px-3.5 py-2 text-xs font-medium text-zinc-300 hover:bg-zinc-800"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="rounded-lg bg-emerald-500 px-4 py-2 text-xs font-semibold text-zinc-950 hover:bg-emerald-400"
            >
              Apply Sort Preview
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
