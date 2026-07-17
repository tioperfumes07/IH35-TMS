import { useMemo } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { expensiveStatesCatalogClient } from "../../../api/catalogs-fuel";

type Props = {
  companyId: string;
  value: string[];
  onChange: (codes: string[]) => void;
};

export function ExpensiveStatesMultiselect({ companyId, value, onChange }: Props) {
  const query = useQuery({
    queryKey: ["catalogs", "fuel", "expensive-states", companyId],
    queryFn: () =>
      expensiveStatesCatalogClient.list({
        operating_company_id: companyId,
        is_active: "true",
        limit: 200,
        offset: 0,
      }),
    enabled: Boolean(companyId),
  });

  const rows = useMemo(
    () => [...(query.data?.rows ?? [])].sort((a, b) => a.sort_order - b.sort_order || a.code.localeCompare(b.code)),
    [query.data?.rows],
  );

  const catalogCodes = useMemo(() => new Set(rows.map((row) => row.code)), [rows]);
  const orphanCodes = useMemo(() => value.filter((code) => !catalogCodes.has(code)), [catalogCodes, value]);

  const toggleCode = (code: string) => {
    onChange(value.includes(code) ? value.filter((item) => item !== code) : [...value, code]);
  };

  if (query.isLoading) {
    return <p className="text-xs text-gray-500">Loading expensive states catalog…</p>;
  }

  if (query.isError) {
    return (
      <div className="space-y-1 text-xs">
        <p className="text-red-700">Failed to load expensive states catalog.</p>
        <button type="button" className="font-semibold text-slate-700 underline" onClick={() => void query.refetch()}>
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {rows.map((row) => {
          const checked = value.includes(row.code);
          return (
            <label
              key={row.id}
              className={`inline-flex cursor-pointer items-center gap-1.5 rounded-sm border px-2 py-1 text-xs ${
                checked ? "border-slate-700 bg-slate-50" : "border-gray-300 bg-white"
              }`}
            >
              <input type="checkbox" checked={checked} onChange={() => toggleCode(row.code)} />
              <span className="font-semibold tracking-normal [font-variant-ligatures:none]">{row.code}</span>
              <span className="text-gray-500">{row.display_name}</span>
            </label>
          );
        })}
      </div>
      {rows.length === 0 ? <p className="text-xs text-gray-500">No active expensive states in catalog.</p> : null}
      {orphanCodes.length > 0 ? (
        <p className="text-xs text-slate-600">
          Saved codes not in catalog (kept until removed): {orphanCodes.join(", ")}
        </p>
      ) : null}
      <Link to="/lists/fuel/expensive-states" className="inline-block text-xs font-semibold text-slate-700 underline">
        Manage Expensive States catalog
      </Link>
    </div>
  );
}
