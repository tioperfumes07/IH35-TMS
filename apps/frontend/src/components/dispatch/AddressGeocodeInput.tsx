import { useEffect, useRef, useState } from "react";
import { useFeatureFlag } from "../../hooks/useFeatureFlag";
import { geocodeSearch, type GeocodeResult } from "../../api/geocoding";

// PC*MILER geocoding autocomplete for the Book Load §C one-line address (the field shipped in #1134).
// GATED on PCMILER_ENABLED: flag OFF → a plain text input identical to #1134 (NO Trimble call). Flag ON →
// debounced (400ms, min 3 chars) lookups against OUR backend proxy (/api/v1/geocoding/search); on select,
// onResolve fires with the parsed result so the caller can populate city/state/country. The Trimble key is
// never touched here (server-side only). Identical queries are cached client-side to conserve the trial cap.
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
  const { enabled } = useFeatureFlag("PCMILER_ENABLED");
  const [results, setResults] = useState<GeocodeResult[]>([]);
  const [open, setOpen] = useState(false);
  const cacheRef = useRef<Map<string, GeocodeResult[]>>(new Map());
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    if (!enabled) {
      setResults([]);
      return;
    }
    const q = value.trim();
    if (q.length < MIN_CHARS) {
      setResults([]);
      return;
    }
    if (timerRef.current) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(async () => {
      const key = q.toLowerCase();
      const cached = cacheRef.current.get(key);
      if (cached) {
        setResults(cached);
        setOpen(cached.length > 0);
        return;
      }
      try {
        const resp = await geocodeSearch(q);
        const rs = resp.enabled ? resp.results ?? [] : [];
        cacheRef.current.set(key, rs);
        setResults(rs);
        setOpen(rs.length > 0);
      } catch {
        setResults([]);
      }
    }, DEBOUNCE_MS);
    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
    };
  }, [value, enabled]);

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
          className="absolute z-20 mt-0.5 max-h-48 w-full overflow-auto rounded border border-gray-300 bg-white text-xs shadow-lg"
          data-pcmiler-suggestions="true"
        >
          {results.map((r, i) => (
            <li key={`${r.formatted}-${i}`}>
              <button
                type="button"
                className="block w-full truncate px-2 py-1 text-left hover:bg-blue-50"
                onMouseDown={(e) => {
                  e.preventDefault();
                  onResolve(r);
                  onChange(r.formatted);
                  setOpen(false);
                }}
              >
                {r.formatted}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
