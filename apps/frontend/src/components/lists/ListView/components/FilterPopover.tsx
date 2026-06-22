import { useRef, useState } from "react";
import type { ListViewFilter } from "../types";

interface Props {
  filter: ListViewFilter;
  activeValues: string[];
  onChange: (values: string[]) => void;
  rows: Record<string, unknown>[];
}

export function FilterPopover({ filter, activeValues, onChange, rows }: Props) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const btnRef = useRef<HTMLButtonElement>(null);

  const options: { value: string; label: string }[] =
    filter.options ??
    Array.from(new Set(rows.map((r) => String(r[filter.id] ?? "")))).sort().map((v) => ({ value: v, label: v }));

  const filtered = options.filter(
    (o) =>
      !search || o.label.toLowerCase().includes(search.toLowerCase())
  );

  const toggleValue = (value: string) => {
    if (activeValues.includes(value)) {
      onChange(activeValues.filter((v) => v !== value));
    } else {
      onChange([...activeValues, value]);
    }
  };

  const count = activeValues.length;
  const isActive = count > 0;

  return (
    <div className="relative inline-block">
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`flex items-center gap-1 px-2 py-1 text-xs rounded border transition-colors ${
          isActive
            ? "bg-slate-100 border-slate-300 text-slate-700"
            : "border-gray-300 text-gray-600 hover:bg-gray-50"
        }`}
      >
        {filter.label}
        {isActive && (
          <span className="bg-slate-1000 text-white text-[10px] font-semibold rounded-full px-1.5 py-0.5 leading-none">
            {count}
          </span>
        )}
        <span className="text-gray-400">▾</span>
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-8 z-30 w-56 bg-white border border-gray-200 rounded-lg shadow-xl p-3 space-y-2">
            {options.length > 6 && (
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search…"
                className="w-full text-xs border border-gray-300 rounded px-2 py-1 outline-none focus:ring-1 focus:ring-slate-400"
              />
            )}
            <div className="max-h-52 overflow-y-auto space-y-0.5">
              <label className="flex items-center gap-2 text-xs text-gray-700 py-0.5 cursor-pointer hover:bg-gray-50 px-1 rounded">
                <input
                  type="checkbox"
                  checked={count === 0}
                  onChange={() => onChange([])}
                  className="rounded border-gray-300"
                />
                <span className="font-medium">All</span>
              </label>
              {filtered.map((opt) => (
                <label
                  key={opt.value}
                  className="flex items-center gap-2 text-xs text-gray-700 py-0.5 cursor-pointer hover:bg-gray-50 px-1 rounded"
                >
                  <input
                    type="checkbox"
                    checked={activeValues.includes(opt.value)}
                    onChange={() => toggleValue(opt.value)}
                    className="rounded border-gray-300"
                  />
                  {opt.label}
                </label>
              ))}
            </div>
            {count > 0 && (
              <button
                type="button"
                onClick={() => onChange([])}
                className="w-full text-xs text-slate-700 hover:text-slate-700 text-left"
              >
                Clear
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
