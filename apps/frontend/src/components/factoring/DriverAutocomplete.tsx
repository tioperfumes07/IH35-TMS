import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { listDrivers } from "../../api/mdata";

type Props = {
  companyId: string;
  value: string;
  onChange: (driverId: string, driverName: string) => void;
  placeholder?: string;
  // Optional page size. Callers that must not miss active drivers past the newest 50 (the listDrivers
  // default cap) pass e.g. 200. Omitted → unchanged behavior for existing callers.
  limit?: number;
  /**
   * PLUS-DRIVER-MONEY: opt-in "+ Create driver" row for money-tagging call sites (bank tx
   * categorization / split-line driver linkage) where the driver may genuinely not exist yet.
   * Omitted → unchanged behavior (no create row) for lookup-only callers (e.g. FactoringHome's
   * vendor-merge picker, which only makes sense for an already-existing driver).
   */
  onRequestCreate?: () => void;
};

export function DriverAutocomplete({ companyId, value, onChange, placeholder = "Search driver by name", limit, onRequestCreate }: Props) {
  const [search, setSearch] = useState("");
  // Show-on-focus (not gated behind a typed query): the initial unfiltered roster is visible as soon as
  // the field is focused, so an empty result reads as "genuinely no drivers under this entity", not
  // "broken picker". A short close-delay lets the click on a list button register before blur hides it.
  const [focused, setFocused] = useState(false);

  const driversQuery = useQuery({
    queryKey: ["factoring", "driver-autocomplete", companyId, search, limit ?? null],
    queryFn: () =>
      listDrivers({ operating_company_id: companyId, search: search || undefined, status: "active", limit }).then((res) => res.drivers),
    enabled: Boolean(companyId),
  });

  const selectedName = useMemo(() => {
    const match = (driversQuery.data ?? []).find((driver) => driver.id === value);
    return match ? `${match.first_name} ${match.last_name}`.trim() : "";
  }, [driversQuery.data, value]);

  const rows = driversQuery.data ?? [];

  return (
    <div className="space-y-1" data-driver-autocomplete="true">
      <input
        className="w-full rounded-sm border border-gray-300 px-2 py-1 text-xs"
        value={search || selectedName}
        placeholder={placeholder}
        onFocus={() => setFocused(true)}
        onBlur={() => setTimeout(() => setFocused(false), 150)}
        onChange={(event) => setSearch(event.target.value)}
      />
      {focused ? (
        <div className="max-h-40 overflow-y-auto rounded-sm border border-gray-200 bg-white">
          {/* QB-STD-1: add row is FIRST — always visible before any typing (Combobox convention). */}
          {onRequestCreate ? (
            <button
              type="button"
              className="block w-full border-b border-gray-100 px-2 py-1 text-left text-xs font-medium text-slate-600 hover:bg-gray-50"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                onRequestCreate();
                setSearch("");
                setFocused(false);
              }}
            >
              + Create driver
            </button>
          ) : null}
          {driversQuery.isLoading ? <p className="px-2 py-1 text-xs text-gray-500">Loading drivers...</p> : null}
          {!driversQuery.isLoading && rows.length === 0 ? (
            <p className="px-2 py-1 text-xs text-gray-500">No drivers found for this company.</p>
          ) : null}
          {rows.slice(0, 20).map((driver) => (
            <button
              key={driver.id}
              type="button"
              className="block w-full px-2 py-1 text-left text-xs hover:bg-gray-50"
              onClick={() => {
                onChange(driver.id, `${driver.first_name} ${driver.last_name}`.trim());
                setSearch("");
                setFocused(false);
              }}
            >
              {`${driver.first_name} ${driver.last_name}`.trim() || driver.id}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
