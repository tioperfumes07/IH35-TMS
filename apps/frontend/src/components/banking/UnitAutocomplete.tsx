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

  return (
    <div className="space-y-1" data-unit-autocomplete="true">
      <input
        className="w-full rounded-sm border border-gray-300 px-2 py-1 text-xs"
        value={search || selectedLabel}
        placeholder={placeholder}
        onChange={(event) => setSearch(event.target.value)}
      />
      {search.trim() ? (
        <div className="max-h-40 overflow-y-auto rounded-sm border border-gray-200 bg-white">
          {(unitsQuery.data ?? []).slice(0, 20).map((u) => (
            <button
              key={u.id}
              type="button"
              className="block w-full px-2 py-1 text-left text-xs hover:bg-gray-50"
              onClick={() => {
                onChange(u.id, label(u));
                setSearch("");
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
