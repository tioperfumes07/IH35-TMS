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

  const loadsQuery = useQuery({
    queryKey: ["banking", "load-autocomplete", companyId, search],
    queryFn: () =>
      listLoads({ operating_company_id: [companyId], search: search || undefined, limit: 50 }).then(
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

  return (
    <div className="space-y-1" data-load-autocomplete="true">
      <input
        className="w-full rounded-sm border border-gray-300 px-2 py-1 text-xs"
        value={search || selectedLabel}
        placeholder={placeholder}
        onChange={(event) => setSearch(event.target.value)}
      />
      {search.trim() ? (
        <div className="max-h-40 overflow-y-auto rounded-sm border border-gray-200 bg-white">
          {(loadsQuery.data ?? []).slice(0, 20).map((l) => (
            <button
              key={l.id}
              type="button"
              className="block w-full px-2 py-1 text-left text-xs hover:bg-gray-50"
              onClick={() => {
                onChange(l.id, label(l));
                setSearch("");
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
