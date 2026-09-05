import { useEffect, useRef, useState } from "react";
import { geocodeSearch, type GeocodeResult } from "../../api/geocoding";

// Address autocomplete for the Book Load §C one-line address (the field shipped in #1134).
// Debounced (400ms, min 3 chars) lookups against OUR backend proxy (/api/v1/geocoding/search), which picks the
// provider server-side (Trimble/PC*MILER or Google — RULING 3). The ONLY gate is the backend's own
// `enabled` answer: 2026-09-05 measured that the old `useFeatureFlag("PCMILER_ENABLED")` gate pointed at a
// lib.feature_flags key that does not exist in production, so the field silently degraded to plain text for
// everyone. On select, onResolve fires with the parsed result so the caller populates city/state/zip/country.
// Provider keys are never touched here (server-side only). Identical queries are cached client-side.
const MIN_CHARS = 3;
const DEBOUNCE_MS = 400;

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
  const [results, setResults] = useState<GeocodeResult[]>([]);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retryGeneration, setRetryGeneration] = useState(0);
  const cacheRef = useRef<Map<string, GeocodeResult[]>>(new Map());
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    if (!enabled) {
      setResults([]);
      setError(null);
      return;
    }
    const q = value.trim();
    if (q.length < MIN_CHARS) {
      setResults([]);
      setError(null);
      return;
    }
    if (timerRef.current) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(async () => {
      const key = q.toLowerCase();
      const cached = cacheRef.current.get(key);
      if (cached) {
        setError(null);
        setResults(cached);
        setOpen(cached.length > 0);
        return;
      }
      try {
        setError(null);
        const resp = await geocodeSearch(q);
        setEnabled(Boolean(resp.enabled));
        const rs = resp.enabled ? resp.results ?? [] : [];
        cacheRef.current.set(key, rs);
        setResults(rs);
        setOpen(rs.length > 0);
      } catch {
        setResults([]);
        setOpen(false);
        setError("Address suggestions are unavailable. You can keep typing the address or retry.");
      }
    }, DEBOUNCE_MS);
    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
    };
  }, [value, enabled, retryGeneration]);

  return (
    <div className="relative">
      <input
        {...(dataAttrs ?? {})}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setOpen(results.length > 0)}
        onBlur={() => window.setTimeout(() => setOpen(false), 150)}
        placeholder={placeholder}
        className={className}
        autoComplete="off"
      />
      {enabled && open && results.length > 0 ? (
        <ul
          className="absolute z-20 mt-0.5 max-h-48 w-full overflow-auto rounded-sm border border-gray-300 bg-white text-xs shadow-lg"
          data-pcmiler-suggestions="true"
        >
          {results.map((r, i) => (
            <li key={`${r.formatted}-${i}`}>
              <button
                type="button"
                className="block w-full truncate px-2 py-1 text-left hover:bg-slate-100"
                onMouseDown={(e) => {
                  e.preventDefault();
                  onResolve(r);
                  onChange(r.formatted);
                  setOpen(false);
                }}
              >
                {r.name ? <span className="font-semibold">{r.name} · </span> : null}
                {r.formatted}
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
