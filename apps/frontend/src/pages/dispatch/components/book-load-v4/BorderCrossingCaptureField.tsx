import { useEffect, useState } from "react";
import { fetchPortsOfEntry, type PortOfEntry } from "../../../../components/border-crossing/borderCrossingApi";

type Props = {
  /** Currently selected port-of-entry id (form-backed). */
  value: string;
  /** Fires with the full port row (or null when cleared) so the caller can build the border stop. */
  onSelect: (port: PortOfEntry | null) => void;
  /** Inline validation message (e.g. required-but-missing on submit). */
  error?: string | null;
};

/**
 * Book Load border-crossing capture. Shown for cross-border (NB/SB) trips so the operator records
 * the port of entry — on submit this becomes a stop_type='border' stop, which is what makes
 * LoadDetailDrawer.loadHasCrossBorder() show the Customs tab. Native <select> (dismisses on its own —
 * not a trapping picker).
 */
export function BorderCrossingCaptureField({ value, onSelect, error }: Props) {
  const [ports, setPorts] = useState<PortOfEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void fetchPortsOfEntry()
      .then((rows) => {
        if (!cancelled) {
          setPorts(rows);
          setLoadError(null);
        }
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setPorts([]);
          setLoadError(e instanceof Error ? e.message : "Failed to load ports of entry");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const us = ports.filter((p) => p.country === "US");
  const mx = ports.filter((p) => p.country === "MX");

  return (
    <div className="border-b border-gray-200 bg-[#fff7ed] px-3 py-2" data-testid="book-load-border-crossing-capture">
      <span className="text-xs font-bold uppercase tracking-[0.4px] text-gray-600">
        Border crossing <span className="text-red-500">*</span>
      </span>
      <p className="mt-0.5 text-xs text-gray-600">
        This is a cross-border load. Record the port of entry where the freight crosses — the crossing
        stop and the Customs tab then appear on the load on their own.
      </p>
      <select
        data-testid="book-load-port-of-entry"
        aria-label="Border crossing port of entry"
        className="mt-1 h-8 w-full max-w-md rounded-sm border border-gray-300 px-2 text-xs"
        value={value}
        disabled={loading}
        onChange={(e) => {
          const id = e.target.value;
          onSelect(ports.find((p) => p.id === id) ?? null);
        }}
      >
        <option value="">{loading ? "Loading ports…" : "Select port of entry"}</option>
        {us.length ? (
          <optgroup label="United States">
            {us.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
                {p.cbp_port_code ? ` (CBP ${p.cbp_port_code})` : ""}
              </option>
            ))}
          </optgroup>
        ) : null}
        {mx.length ? (
          <optgroup label="Mexico">
            {mx.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </optgroup>
        ) : null}
      </select>
      {loadError ? (
        <p className="mt-1 text-xs text-red-600">Could not load ports of entry: {loadError}</p>
      ) : null}
      {error ? (
        <p className="mt-1 text-xs text-red-600" data-testid="book-load-border-crossing-error">
          {error}
        </p>
      ) : null}
    </div>
  );
}
