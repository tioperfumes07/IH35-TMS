import { useEffect, useState } from "react";
import { fetchPortsOfEntry, type PortOfEntry } from "../../../../components/border-crossing/borderCrossingApi";
import { SelectCombobox } from "../../../../components/Combobox";

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
 * LoadDetailDrawer.loadHasCrossBorder() show the Customs tab. Native <SelectCombobox> (dismisses on its own —
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
    // ROUND 443.265-A item 3 — rendered under the NB / SB trip cards (V3-Dispatch-BookLoad-TripType):
    // "Border crossing — port of entry *", the select, and the one-line consequence beside it.
    <div className="mt-2" data-testid="book-load-border-crossing-capture">
      <span className="text-xs font-bold text-[#4B5563]">
        Border crossing — port of entry <span className="text-red-500">*</span>
      </span>
      <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1">
      {/* SelectCombobox wraps itself in a bare <div>, which shrinks to content in this flex row —
          the 390px (board) width belongs on this cell. */}
      <div className="w-[390px] max-w-full shrink-0">
        <SelectCombobox
          data-testid="book-load-port-of-entry"
          aria-label="Border crossing port of entry"
          className="h-8 w-full rounded-sm border border-gray-300 px-2 text-xs"
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
        </SelectCombobox>
      </div>
        <span className="text-xs text-[#4B5563]">
          Cross-border load. The crossing stop and the Customs tab then appear on the load on their own.
        </span>
      </div>
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
