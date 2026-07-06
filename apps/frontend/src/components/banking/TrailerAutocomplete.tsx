import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { listUnits } from "../../api/mdata";

type UnifiedFleetRow = {
  id: string;
  kind: "truck" | "trailer";
  unit_number: string;
};

type Props = {
  companyId: string;
  value: string;
  onChange: (trailerId: string, trailerLabel: string) => void;
  placeholder?: string;
};

// BANK-SPLIT-1 (Part 1 linkage) — Trailer picker for bank-transaction categorization + split lines.
// Trailers are mdata.equipment rows (NEVER mdata.loads.trailer_id — no such column exists). Reuses the
// already-entity-scoped unified fleet list (`include=trailers`, kind:"truck"|"trailer") instead of a new
// endpoint — the same source the Fleet roster already uses.
export function TrailerAutocomplete({ companyId, value, onChange, placeholder = "Search trailer (optional)" }: Props) {
  const [search, setSearch] = useState("");

  const trailersQuery = useQuery({
    queryKey: ["banking", "trailer-autocomplete", companyId, search],
    queryFn: () =>
      listUnits({ operating_company_id: companyId, search: search || undefined, limit: 500, include: "trailers" }).then(
        (res) => ((res.units as UnifiedFleetRow[]) ?? []).filter((u) => u.kind === "trailer")
      ),
    enabled: Boolean(companyId),
  });

  const label = (t: UnifiedFleetRow) => String(t.unit_number ?? t.id);
  const selectedLabel = useMemo(() => {
    const match = (trailersQuery.data ?? []).find((t) => t.id === value);
    return match ? label(match) : "";
  }, [trailersQuery.data, value]);

  return (
    <div className="space-y-1" data-trailer-autocomplete="true">
      <input
        className="w-full rounded-sm border border-gray-300 px-2 py-1 text-xs"
        value={search || selectedLabel}
        placeholder={placeholder}
        onChange={(event) => setSearch(event.target.value)}
      />
      {search.trim() ? (
        <div className="max-h-40 overflow-y-auto rounded-sm border border-gray-200 bg-white">
          {(trailersQuery.data ?? []).slice(0, 20).map((t) => (
            <button
              key={t.id}
              type="button"
              className="block w-full px-2 py-1 text-left text-xs hover:bg-gray-50"
              onClick={() => {
                onChange(t.id, label(t));
                setSearch("");
              }}
            >
              {label(t)}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
