import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { listLocations, type MdataLocation } from "../../api/mdata";
import { Combobox } from "../Combobox";
import { CappedListNotice } from "../CappedListNotice";
import {
  formatFuelStopLocationLabel,
  formatFuelStopLocationSublabel,
} from "../../lib/fuelStopLocationLabel";

type Props = {
  operatingCompanyId: string;
  /** Selected mdata.locations id, or null when cleared / free-text only. */
  value: string | null;
  /**
   * Called with the catalog row (or null on clear). Callers that only store the AT-style
   * label string should use `formatFuelStopLocationLabel(location)` from the callback.
   */
  onChange: (locationId: string | null, location: MdataLocation | null) => void;
  disabled?: boolean;
  placeholder?: string;
  dataTestId?: string;
  /**
   * When true (default), list only location_type=fuel_stop (Love's 604 + any other fuel stops).
   * Truck-stop rows stay out of the fuel vendor location catalog.
   */
  fuelStopOnly?: boolean;
};

const LIST_LIMIT = 200;

/**
 * Shared fuel-stop location catalog picker — feeds Settlement Creator fuel/expense Location,
 * Create Fuel Purchase, and Record Expense from mdata.locations (LOVES-* + coords live).
 * Server-side search (604 Love's stores) — never local-only filter of a truncated page.
 */
export function FuelStopLocationPicker({
  operatingCompanyId,
  value,
  onChange,
  disabled,
  placeholder = "Search Love's / fuel stop…",
  dataTestId = "fuel-stop-location-picker",
  fuelStopOnly = true,
}: Props) {
  const [search, setSearch] = useState("");

  const locationsQuery = useQuery({
    queryKey: ["fuel-stop-locations", operatingCompanyId, search, fuelStopOnly],
    queryFn: () =>
      listLocations({
        operating_company_id: operatingCompanyId,
        limit: LIST_LIMIT,
        search: search.trim() || undefined,
        location_type: fuelStopOnly ? "fuel_stop" : undefined,
        status: "active",
      }),
    enabled: Boolean(operatingCompanyId),
    staleTime: 30_000,
  });

  const rows = locationsQuery.data?.locations ?? [];
  const options = rows.map((l) => ({
    value: l.id,
    label: formatFuelStopLocationLabel(l),
    sublabel: formatFuelStopLocationSublabel(l),
  }));

  return (
    <div className="space-y-1">
      <Combobox
        options={options}
        value={value}
        onChange={(next) => {
          const row = rows.find((r) => r.id === next) ?? null;
          onChange(next, row);
        }}
        placeholder={locationsQuery.isLoading ? "Loading fuel stops…" : placeholder}
        onSearch={setSearch}
        loading={locationsQuery.isLoading}
        disabled={disabled}
        allowClear
        clearCommittedOnEdit
        dataTestId={dataTestId}
        size="sm"
      />
      <CappedListNotice
        shown={rows.length}
        limit={LIST_LIMIT}
        hint="Type store #, city, or street to search all fuel stops."
      />
      {locationsQuery.isError ? (
        <p className="text-xs text-red-600">Could not load fuel stop locations.</p>
      ) : null}
    </div>
  );
}
