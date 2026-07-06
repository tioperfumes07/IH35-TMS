import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { listLoads, type DispatchLoadRow } from "../../api/loads";

type Props = {
  companyId: string;
  value: string;
  onChange: (loadId: string, loadLabel: string) => void;
  placeholder?: string;
};

// BLOCK-6b — Trip (load) picker for bank-transaction categorization. The chosen load flows to the
// deduction's load_id DIRECTLY (load↔advance load_id-direct rule) so a driver expense recovery is
// traceable to the exact trip.
export function LoadAutocomplete({ companyId, value, onChange, placeholder = "Search trip / load (optional)" }: Props) {
  const [search, setSearch] = useState("");
  // Show-on-focus (not gated behind a typed query): the initial unfiltered trip/load list is visible as
  // soon as the field is focused, so an empty result reads as "genuinely no loads under this entity", not
  // "broken picker". A short close-delay lets the click on a list button register before blur hides it.
  const [focused, setFocused] = useState(false);

  const loadsQuery = useQuery({
    queryKey: ["banking", "load-autocomplete", companyId, search],
    queryFn: () =>
      // limit bumped 50 -> 200 (driver/unit/trailer pickers already dodge their server 50-cap the same way).
      listLoads({ operating_company_id: [companyId], search: search || undefined, limit: 200 }).then(
        (res) => res.loads ?? []
      ),
    enabled: Boolean(companyId),
  });

  const label = (l: DispatchLoadRow) =>
    `${l.load_number}${l.customer_name ? ` · ${l.customer_name}` : ""}`;
  const selectedLabel = useMemo(() => {
    const match = (loadsQuery.data ?? []).find((l) => l.id === value);
    return match ? label(match) : "";
  }, [loadsQuery.data, value]);

  const rows = loadsQuery.data ?? [];

  return (
    <div className="space-y-1" data-load-autocomplete="true">
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
          {loadsQuery.isLoading ? <p className="px-2 py-1 text-xs text-gray-500">Loading loads...</p> : null}
          {!loadsQuery.isLoading && rows.length === 0 ? (
            <p className="px-2 py-1 text-xs text-gray-500">No loads found for this company.</p>
          ) : null}
          {rows.slice(0, 20).map((l) => (
            <button
              key={l.id}
              type="button"
              className="block w-full px-2 py-1 text-left text-xs hover:bg-gray-50"
              onClick={() => {
                onChange(l.id, label(l));
                setSearch("");
                setFocused(false);
              }}
            >
              {label(l)}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
