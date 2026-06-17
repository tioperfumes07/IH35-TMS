import { useEffect, useMemo, useRef, useState } from "react";

// Shared searchable state/province selector. US today; structured by country so MX
// states can be added for USMCA cross-border later. Stores the 2-letter code (e.g. "TX"),
// which fixes free-text bugs like "TEXAS".
export type StateOption = { code: string; name: string };

export const US_STATES: StateOption[] = [
  { code: "AL", name: "Alabama" }, { code: "AK", name: "Alaska" }, { code: "AZ", name: "Arizona" },
  { code: "AR", name: "Arkansas" }, { code: "CA", name: "California" }, { code: "CO", name: "Colorado" },
  { code: "CT", name: "Connecticut" }, { code: "DE", name: "Delaware" }, { code: "DC", name: "District of Columbia" },
  { code: "FL", name: "Florida" }, { code: "GA", name: "Georgia" }, { code: "HI", name: "Hawaii" },
  { code: "ID", name: "Idaho" }, { code: "IL", name: "Illinois" }, { code: "IN", name: "Indiana" },
  { code: "IA", name: "Iowa" }, { code: "KS", name: "Kansas" }, { code: "KY", name: "Kentucky" },
  { code: "LA", name: "Louisiana" }, { code: "ME", name: "Maine" }, { code: "MD", name: "Maryland" },
  { code: "MA", name: "Massachusetts" }, { code: "MI", name: "Michigan" }, { code: "MN", name: "Minnesota" },
  { code: "MS", name: "Mississippi" }, { code: "MO", name: "Missouri" }, { code: "MT", name: "Montana" },
  { code: "NE", name: "Nebraska" }, { code: "NV", name: "Nevada" }, { code: "NH", name: "New Hampshire" },
  { code: "NJ", name: "New Jersey" }, { code: "NM", name: "New Mexico" }, { code: "NY", name: "New York" },
  { code: "NC", name: "North Carolina" }, { code: "ND", name: "North Dakota" }, { code: "OH", name: "Ohio" },
  { code: "OK", name: "Oklahoma" }, { code: "OR", name: "Oregon" }, { code: "PA", name: "Pennsylvania" },
  { code: "RI", name: "Rhode Island" }, { code: "SC", name: "South Carolina" }, { code: "SD", name: "South Dakota" },
  { code: "TN", name: "Tennessee" }, { code: "TX", name: "Texas" }, { code: "UT", name: "Utah" },
  { code: "VT", name: "Vermont" }, { code: "VA", name: "Virginia" }, { code: "WA", name: "Washington" },
  { code: "WV", name: "West Virginia" }, { code: "WI", name: "Wisconsin" }, { code: "WY", name: "Wyoming" },
  { code: "PR", name: "Puerto Rico" },
];

// MX states (placeholder for USMCA cross-border; wired in once cross-border surfaces need it).
export const MX_STATES: StateOption[] = [];

export const STATES_BY_COUNTRY: Record<string, StateOption[]> = { US: US_STATES, MX: MX_STATES };

type Props = {
  value: string;
  onChange: (code: string) => void;
  country?: "US" | "MX";
  className?: string;
  disabled?: boolean;
  id?: string;
  placeholder?: string;
};

export function StateSelect({ value, onChange, country = "US", className = "", disabled, id, placeholder }: Props) {
  const options = STATES_BY_COUNTRY[country] ?? US_STATES;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.code.toLowerCase().startsWith(q) || o.name.toLowerCase().includes(q));
  }, [query, options]);

  return (
    <div className={`relative ${className}`} ref={ref}>
      <button
        id={id}
        type="button"
        disabled={disabled}
        onClick={() => { setOpen((o) => !o); setQuery(""); }}
        className="flex h-7 w-full items-center justify-between rounded border border-gray-300 px-2 text-left text-xs"
      >
        <span className={value ? "" : "text-gray-400"}>{value || placeholder || "State"}</span>
        <span className="text-gray-400">▾</span>
      </button>
      {open && (
        <div className="absolute z-50 mt-1 max-h-60 w-48 overflow-hidden rounded border border-gray-300 bg-white shadow-lg">
          <input
            autoFocus
            className="h-7 w-full border-b border-gray-200 px-2 text-xs outline-none"
            placeholder="Search state…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <div className="max-h-52 overflow-y-auto">
            {filtered.length === 0 ? (
              <div className="px-2 py-2 text-xs text-gray-400">No match</div>
            ) : (
              filtered.map((o) => (
                <button
                  key={o.code}
                  type="button"
                  className={`flex w-full items-center gap-2 px-2 py-1 text-left text-xs hover:bg-slate-100 ${o.code === value ? "bg-slate-50 font-semibold" : ""}`}
                  onClick={() => { onChange(o.code); setOpen(false); }}
                >
                  <span className="w-6 font-semibold text-gray-600">{o.code}</span>
                  <span className="truncate">{o.name}</span>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
