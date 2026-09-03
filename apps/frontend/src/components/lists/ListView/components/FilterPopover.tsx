import { useEffect, useRef, useState } from "react";
import type { ListViewFilter } from "../types";

interface Props {
  filter: ListViewFilter;
  activeValues: string[];
  onChange: (values: string[]) => void;
  rows: Record<string, unknown>[];
}

/**
 * LINK-F5170 lists:chrome.toolbar_filter — draft→Apply gate.
 * Checkbox clicks stage locally; only Apply commits into applied filter state
 * (same chrome law #5 contract as CollapsedListFilters / UniversalListToolbar range).
 */
export function FilterPopover({ filter, activeValues, onChange, rows }: Props) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [draft, setDraft] = useState<string[]>(activeValues);
  const btnRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const options: { value: string; label: string }[] =
    filter.options ??
    Array.from(new Set(rows.map((r) => String(r[filter.id] ?? "")))).sort().map((v) => ({ value: v, label: v }));

  const filtered = options.filter(
    (o) =>
      !search || o.label.toLowerCase().includes(search.toLowerCase())
  );

  const cancel = () => {
    setDraft(activeValues);
    setSearch("");
    setOpen(false);
  };

  const reset = () => setDraft([]);

  const apply = () => {
    onChange(draft);
    setSearch("");
    setOpen(false);
  };

  useEffect(() => {
    if (open) {
      setDraft(activeValues);
      setSearch("");
    }
  }, [open, activeValues]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (event: MouseEvent) => {
      if (
        panelRef.current &&
        !panelRef.current.contains(event.target as Node) &&
        btnRef.current &&
        !btnRef.current.contains(event.target as Node)
      ) {
        setDraft(activeValues);
        setSearch("");
        setOpen(false);
      }
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setDraft(activeValues);
        setSearch("");
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, activeValues]);

  const toggleValue = (value: string) => {
    setDraft((current) =>
      current.includes(value) ? current.filter((v) => v !== value) : [...current, value]
    );
  };

  const appliedCount = activeValues.length;
  const draftCount = draft.length;
  const isActive = appliedCount > 0;

  return (
    <div className="relative inline-block">
      <button
        ref={btnRef}
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={`flex items-center gap-1 px-2 py-1 text-xs rounded border transition-colors ${
          isActive
            ? "bg-slate-100 border-slate-300 text-slate-700"
            : "border-gray-300 text-gray-600 hover:bg-gray-50"
        }`}
      >
        {filter.label}
        {isActive && (
          <span className="bg-slate-1000 text-white text-xs font-semibold rounded-full px-1.5 py-0.5 leading-none">
            {appliedCount}
          </span>
        )}
        <span className="text-gray-400">▾</span>
      </button>

      {open && (
        <div
          ref={panelRef}
          className="absolute left-0 top-8 z-30 w-56 bg-white border border-gray-200 rounded-lg shadow-xl p-3 space-y-2"
          data-testid="listview-filter-popover"
        >
          {options.length > 6 && (
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search…"
              className="w-full text-xs border border-gray-300 rounded-sm px-2 py-1 outline-hidden focus:ring-1 focus:ring-slate-400"
            />
          )}
          <div className="max-h-52 overflow-y-auto space-y-0.5">
            <label className="flex items-center gap-2 text-xs text-gray-700 py-0.5 cursor-pointer hover:bg-gray-50 px-1 rounded-sm">
              <input
                type="checkbox"
                checked={draftCount === 0}
                onChange={() => setDraft([])}
                className="rounded-sm border-gray-300"
              />
              <span className="font-medium">All</span>
            </label>
            {filtered.map((opt) => (
              <label
                key={opt.value}
                className="flex items-center gap-2 text-xs text-gray-700 py-0.5 cursor-pointer hover:bg-gray-50 px-1 rounded-sm"
              >
                <input
                  type="checkbox"
                  checked={draft.includes(opt.value)}
                  onChange={() => toggleValue(opt.value)}
                  className="rounded-sm border-gray-300"
                />
                {opt.label}
              </label>
            ))}
          </div>
          <div className="flex items-center justify-end gap-2 border-t border-gray-200 pt-2">
            <button
              type="button"
              className="rounded-sm px-2 py-1 text-xs font-semibold text-gray-600 hover:bg-gray-100"
              onClick={reset}
            >
              Reset
            </button>
            <button
              type="button"
              className="rounded-sm border border-gray-300 bg-white px-2 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-50"
              onClick={cancel}
            >
              Cancel
            </button>
            <button
              type="button"
              className="rounded-sm bg-[#1F2A44] px-2 py-1 text-xs font-semibold text-white hover:bg-[#172036]"
              onClick={apply}
            >
              Apply
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
