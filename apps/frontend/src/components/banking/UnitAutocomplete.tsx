import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { listUnits, type MdataUnit } from "../../api/mdata";

type Props = {
  companyId: string;
  value: string;
  onChange: (unitId: string, unitLabel: string) => void;
  placeholder?: string;
};

// BLOCK-6b — Unit (truck) picker for bank-transaction categorization. limit=500 dodges the /mdata/units
// server-side 50-cap (G9-H6) so the FULL fleet is selectable.
export function UnitAutocomplete({ companyId, value, onChange, placeholder = "Search unit (optional)" }: Props) {
  const [search, setSearch] = useState("");
  // Show-on-focus (not gated behind a typed query): the initial unfiltered fleet is visible as soon as
  // the field is focused, so an empty result reads as "genuinely no units under this entity", not
  // "broken picker". A short close-delay lets the click on a list button register before blur hides it.
  const [focused, setFocused] = useState(false);

  const unitsQuery = useQuery({
    queryKey: ["banking", "unit-autocomplete", companyId, search],
    queryFn: () =>
      listUnits({ operating_company_id: companyId, search: search || undefined, limit: 500 }).then(
        (res) => (res.units as MdataUnit[]) ?? []
      ),
    enabled: Boolean(companyId),
  });

  const label = (u: MdataUnit) => String(u.unit_number ?? u.id);
  const selectedLabel = useMemo(() => {
    const match = (unitsQuery.data ?? []).find((u) => u.id === value);
    return match ? label(match) : "";
  }, [unitsQuery.data, value]);

  const rows = unitsQuery.data ?? [];

  return (
    <div className="space-y-1" data-unit-autocomplete="true">
      <input
        className="w-full rounded-sm border border-gray-300 px-2 py-1 text-xs"
        value={search || selectedLabel}
        placeholder={placeholder}
        onFocus={() => setFocused(true)}
        onBlur={() => setTimeout(() => setFocused(false), 150)}
        onChange={(event) => setSearch(event.target.value)}
      />
      {focused ? (
        <div className="max-h-40 overflow-y-auto rounded-sm border border-gray-200 bg-white">
          {unitsQuery.isLoading ? <p className="px-2 py-1 text-xs text-gray-500">Loading units...</p> : null}
          {!unitsQuery.isLoading && rows.length === 0 ? (
            <p className="px-2 py-1 text-xs text-gray-500">No units found for this company.</p>
          ) : null}
          {rows.slice(0, 20).map((u) => (
            <button
              key={u.id}
              type="button"
              className="block w-full px-2 py-1 text-left text-xs hover:bg-gray-50"
              onClick={() => {
                onChange(u.id, label(u));
                setSearch("");
                setFocused(false);
              }}
            >
              {label(u)}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
