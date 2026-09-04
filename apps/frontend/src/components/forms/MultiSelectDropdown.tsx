import { useEffect, useRef, useState } from "react";
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
};

export function MultiSelectDropdown({ label, options, selected, onChange, allLabel = "All", className, ...rest }: Props) {
  const [open, setOpen] = useState(false);
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

  const toggle = (value: string) => {
    onChange(selected.includes(value) ? selected.filter((v) => v !== value) : [...selected, value]);
  };

  const summary = selected.length === 0 ? allLabel : selected.length === 1 ? (options.find((o) => o.value === selected[0])?.label ?? selected[0]) : `${selected.length} selected`;

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
          className="absolute z-20 mt-1 max-h-64 w-48 overflow-y-auto rounded-sm border border-gray-300 bg-white p-1 shadow-lg"
        >
          <button
            type="button"
            onClick={() => onChange([])}
            className="flex w-full items-center gap-2 rounded-sm px-2 py-1 text-left text-xs hover:bg-gray-100"
          >
            <input type="checkbox" readOnly checked={selected.length === 0} className="pointer-events-none" />
            {allLabel}
          </button>
          {options.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => toggle(opt.value)}
              className="flex w-full items-center gap-2 rounded-sm px-2 py-1 text-left text-xs hover:bg-gray-100"
            >
              <input type="checkbox" readOnly checked={selected.includes(opt.value)} className="pointer-events-none" />
              {opt.label}
            </button>
          ))}
        </div>
      ) : null}
      <span className="sr-only">{label}</span>
    </div>
  );
}
