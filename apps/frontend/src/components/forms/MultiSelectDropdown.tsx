import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";

// LV-AUDIT-HISTORY-STATUS-SOURCE-SINGLE-SELECT: filters like Status/Source/Event type are naturally
// multi-valued ("show me Active OR Inactive", "show me Dispatch OR Safety events") — a QuickBooks-style
// single native <select> can only ever isolate one value at a time, forcing a re-query per value to see
// the full picture. Checkbox-list dropdown, immediate-apply (no separate Apply button — a filter toggle
// should take effect the moment it's checked, matching every other checkbox filter in the app).
export type MultiSelectOption = { value: string; label: string };

type Props = {
  label: string;
  options: MultiSelectOption[];
  selected: string[];
  onChange: (next: string[]) => void;
  allLabel?: string;
  className?: string;
  "data-testid"?: string;
  /** FILTER-MULTI-01: large reference lists (Vendor/Customer/Unit/Trailer/Driver/Load/Account/Class)
   *  need a type-to-narrow box inside the open panel — a plain checkbox list of hundreds/thousands
   *  of options is unusable. Small enumerated fields (Status/Category/Type) can omit this. */
  searchable?: boolean;
  searchPlaceholder?: string;
};

export function MultiSelectDropdown({
  label,
  options,
  selected,
  onChange,
  allLabel = "All",
  className,
  searchable = false,
  searchPlaceholder = "Type to narrow…",
  ...rest
}: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  const toggle = (value: string) => {
    onChange(selected.includes(value) ? selected.filter((v) => v !== value) : [...selected, value]);
  };

  // FILTER-MULTI-01: the closed label must never render a truncated value list — always the
  // filter's own name plus a count, e.g. "Status (3)". Zero selected reads as the plain label
  // (or allLabel, when the caller wants an explicit "All" state) so an untouched filter never
  // looks like it's already narrowing anything.
  const summary = selected.length === 0 ? allLabel : `${label} (${selected.length})`;

  const visibleOptions = useMemo(() => {
    if (!searchable || !query.trim()) return options;
    const q = query.trim().toLowerCase();
    return options.filter((o) => o.label.toLowerCase().includes(q));
  }, [options, query, searchable]);

  return (
    <div ref={ref} className={`relative ${className ?? ""}`} data-testid={rest["data-testid"]}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="mt-1 flex items-center gap-1 rounded-sm border border-gray-300 bg-white px-2 py-1 text-xs text-gray-900 hover:bg-gray-50"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="max-w-[10rem] truncate">{summary}</span>
        <ChevronDown className="h-3.5 w-3.5 text-gray-500" />
      </button>
      {open ? (
        <div
          role="listbox"
          className="absolute z-20 mt-1 max-h-72 w-56 overflow-y-auto rounded-sm border border-gray-300 bg-white p-1 shadow-lg"
        >
          {searchable ? (
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={searchPlaceholder}
              className="mb-1 w-full rounded-sm border border-gray-300 px-2 py-1 text-xs"
              data-testid={rest["data-testid"] ? `${rest["data-testid"]}-search` : undefined}
            />
          ) : null}
          <button
            type="button"
            onClick={() => onChange([])}
            className="flex w-full items-center gap-2 rounded-sm px-2 py-1 text-left text-xs hover:bg-gray-100"
          >
            <input type="checkbox" readOnly checked={selected.length === 0} className="pointer-events-none" />
            {allLabel}
          </button>
          {visibleOptions.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => toggle(opt.value)}
              className="flex w-full items-center gap-2 rounded-sm px-2 py-1 text-left text-xs hover:bg-gray-100"
            >
              <input type="checkbox" readOnly checked={selected.includes(opt.value)} className="pointer-events-none" />
              <span className="truncate">{opt.label}</span>
            </button>
          ))}
          {searchable && visibleOptions.length === 0 ? (
            <p className="px-2 py-1 text-xs text-gray-500">No matches for &ldquo;{query}&rdquo;</p>
          ) : null}
        </div>
      ) : null}
      <span className="sr-only">{label}</span>
    </div>
  );
}
