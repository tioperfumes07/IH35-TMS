import { useEffect, useRef, useState } from "react";
import { geocodePlace, geocodeSearch, geocodeSuggest, type AddressSuggestion, type GeocodeResult } from "../../api/geocoding";

// Address picker for the Book Load §C one-line address (the field shipped in #1134).
// 2026-09-05 (owner: "type in tyson and it starts giving locations" / "add autocomplete for addresses"):
//   1. per keystroke (400ms debounce, min 3 chars) → /api/v1/geocoding/suggest = Google Places Autocomplete (New)
//      predictions, grouped by one session token so keystrokes + the pick bill as ONE session;
//   2. pick a prediction → /api/v1/geocoding/place/:id = Place Details (New) → onResolve fills
//      address_line1/city/state/zip/country/lat/lon (+ landmarks when Google has them);
//   3. no predictions → /api/v1/geocoding/search (Places Text Search, then Geocoding / Trimble) as fallback.
// The ONLY enable gate is the backend's own `enabled` answer (the old PCMILER_ENABLED client flag never existed
// in production). Provider keys never reach the browser.
const MIN_CHARS = 3;
const DEBOUNCE_MS = 400;

type Row = { kind: "suggestion"; s: AddressSuggestion } | { kind: "result"; r: GeocodeResult };

function newSession(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }
}

export function AddressGeocodeInput({
  value,
  onChange,
  onResolve,
  placeholder,
  className,
  dataAttrs,
}: {
  value: string;
  onChange: (v: string) => void;
  onResolve: (r: GeocodeResult) => void;
  placeholder?: string;
  className?: string;
  dataAttrs?: Record<string, string>;
}) {
  // enabled = the backend said so on the last lookup (never a client-side flag). Starts true so the first
  // 3-char query is attempted; flips false only when the proxy answers { enabled:false }.
  const [enabled, setEnabled] = useState(true);
  const [rows, setRows] = useState<Row[]>([]);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resolving, setResolving] = useState(false);
  const [retryGeneration, setRetryGeneration] = useState(0);
  const cacheRef = useRef<Map<string, Row[]>>(new Map());
  const timerRef = useRef<number | null>(null);
  const sessionRef = useRef<string>(newSession());
  const skipNextLookupRef = useRef(false);

  useEffect(() => {
    if (!enabled) {
      setRows([]);
      setError(null);
      return;
    }
    if (skipNextLookupRef.current) {
      // The value just changed because the user picked a row — do not re-query the picked address.
      skipNextLookupRef.current = false;
      return;
    }
    const q = value.trim();
    if (q.length < MIN_CHARS) {
      setRows([]);
      setError(null);
      return;
    }
    if (timerRef.current) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(async () => {
      const key = q.toLowerCase();
      const cached = cacheRef.current.get(key);
      if (cached) {
        setError(null);
        setRows(cached);
        setOpen(cached.length > 0);
        return;
      }
      try {
        setError(null);
        let next: Row[] = [];
        const sug = await geocodeSuggest(q, sessionRef.current);
        if (!sug.enabled) {
          setEnabled(false);
          setRows([]);
          setOpen(false);
          return;
        }
        next = (sug.suggestions ?? []).map((s) => ({ kind: "suggestion", s }) as Row);
        if (next.length === 0) {
          const resp = await geocodeSearch(q);
          setEnabled(Boolean(resp.enabled));
          next = (resp.enabled ? resp.results ?? [] : []).map((r) => ({ kind: "result", r }) as Row);
        }
        cacheRef.current.set(key, next);
        setRows(next);
        setOpen(next.length > 0);
      } catch {
        setRows([]);
        setOpen(false);
        setError("Address suggestions are unavailable. You can keep typing the address or retry.");
      }
    }, DEBOUNCE_MS);
    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
    };
  }, [value, enabled, retryGeneration]);

  async function pick(row: Row) {
    setOpen(false);
    if (row.kind === "result") {
      skipNextLookupRef.current = true;
      onResolve(row.r);
      onChange(row.r.formatted);
      sessionRef.current = newSession();
      return;
    }
    try {
      setResolving(true);
      setError(null);
      const d = await geocodePlace(row.s.placeId, sessionRef.current);
      sessionRef.current = newSession();
      skipNextLookupRef.current = true;
      onResolve(d.result);
      onChange(d.result.formatted || row.s.text);
    } catch {
      // Keep what the user typed; let them retry or keep typing.
      setError("Could not load that address. Pick another suggestion or retry.");
    } finally {
      setResolving(false);
    }
  }

  return (
    <div className="relative">
      <input
        {...(dataAttrs ?? {})}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setOpen(rows.length > 0)}
        onBlur={() => window.setTimeout(() => setOpen(false), 150)}
        placeholder={placeholder}
        className={className}
        autoComplete="off"
        aria-busy={resolving || undefined}
      />
      {enabled && open && rows.length > 0 ? (
        <ul
          className="absolute z-20 mt-0.5 max-h-56 w-full overflow-auto rounded-sm border border-gray-300 bg-white text-xs shadow-lg"
          data-pcmiler-suggestions="true"
        >
          {rows.map((row, i) => (
            <li key={row.kind === "suggestion" ? row.s.placeId : `${row.r.formatted}-${i}`}>
              <button
                type="button"
                className="block w-full truncate px-2 py-1 text-left hover:bg-slate-100"
                onMouseDown={(e) => {
                  e.preventDefault();
                  void pick(row);
                }}
              >
                {row.kind === "suggestion" ? (
                  <>
                    <span className="font-semibold">{row.s.mainText}</span>
                    {row.s.secondaryText ? <span className="text-slate-600"> · {row.s.secondaryText}</span> : null}
                  </>
                ) : (
                  <>
                    {row.r.name ? <span className="font-semibold">{row.r.name} · </span> : null}
                    {row.r.formatted}
                  </>
                )}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {enabled && error ? (
        <div className="mt-1 flex items-center justify-between gap-2 text-[11px] text-red-700" role="alert">
          <span>{error}</span>
          <button
            type="button"
            className="shrink-0 font-semibold underline underline-offset-2"
            onClick={() => setRetryGeneration((generation) => generation + 1)}
          >
            Retry
          </button>
        </div>
      ) : null}
    </div>
  );
}
