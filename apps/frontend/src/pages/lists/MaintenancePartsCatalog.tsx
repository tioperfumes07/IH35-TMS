/**
 * CLOSURE-10 — MaintenancePartsCatalog: enhanced parts by manufacturer with search + filter.
 * Route: /lists/maintenance/parts-catalog
 */
import { useState } from "react";
import { BackArrowHeader } from "../../components/layout/BackArrowHeader";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { useMaintenancePartsCatalog } from "../../hooks/useMaintenancePartsCatalog";
import { ListErrorBanner } from "../../components/shared/ListErrorBanner";
import { SelectCombobox } from "../../components/shared/SelectCombobox";

const MANUFACTURERS = ["", "Detroit Diesel", "Cummins", "Freightliner", "Peterbilt", "Kenworth"];
const CATEGORIES = [
  "", "engine", "transmission", "brake", "tire", "suspension",
  "electrical", "fuel_system", "cooling", "exhaust", "cabin",
  "reefer", "body", "fluid", "filter", "other",
];

function cents(n: number) {
  return n > 0 ? `$${(n / 100).toFixed(2)}` : "—";
}

export function MaintenancePartsCatalog() {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const [search, setSearch] = useState("");
  const [manufacturer, setManufacturer] = useState("");
  const [category, setCategory] = useState("");
  const [page, setPage] = useState(1);

  const query = useMaintenancePartsCatalog({
    operating_company_id: companyId,
    search: search || undefined,
    manufacturer: manufacturer || undefined,
    category: category || undefined,
    page,
    limit: 50,
  });

  const rows = query.data?.rows ?? [];
  const total = query.data?.total ?? 0;

  return (
    <div className="space-y-3">
      <BackArrowHeader
        backTo="/lists"
        breadcrumb={["Lists & Catalogs", "Maintenance", "Parts Catalog"]}
        title="Maintenance Parts Catalog"
        countBadge={total}
      />

      {query.isError && <ListErrorBanner onRetry={() => void query.refetch()} />}

      <div className="grid gap-2 rounded border border-gray-200 bg-white p-3 md:grid-cols-4">
        <input
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          placeholder="Search by SKU, name, or UPC"
          className="h-9 rounded border border-gray-300 px-2 text-sm md:col-span-2"
        />
        <SelectCombobox value={manufacturer} onChange={(e) => { setManufacturer(e.target.value); setPage(1); }} className="h-9 rounded border border-gray-300 px-2 text-sm">
          {MANUFACTURERS.map((m) => <option key={m} value={m}>{m || "All manufacturers"}</option>)}
        </SelectCombobox>
        <SelectCombobox value={category} onChange={(e) => { setCategory(e.target.value); setPage(1); }} className="h-9 rounded border border-gray-300 px-2 text-sm">
          {CATEGORIES.map((c) => <option key={c} value={c}>{c || "All categories"}</option>)}
        </SelectCombobox>
      </div>

      <div className="overflow-x-auto rounded border border-gray-200 bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-600">
            <tr>
              <th className="px-3 py-2 text-left">SKU</th>
              <th className="px-3 py-2 text-left">Part Name</th>
              <th className="px-3 py-2 text-left">Manufacturer</th>
              <th className="px-3 py-2 text-left">Category</th>
              <th className="px-3 py-2 text-left">Compatible Models</th>
              <th className="px-3 py-2 text-right">Typical Cost</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-t border-gray-100 hover:bg-gray-50">
                <td className="px-3 py-2 font-mono text-xs">{row.sku}</td>
                <td className="px-3 py-2 font-medium">{row.part_name}</td>
                <td className="px-3 py-2">{row.manufacturer}</td>
                <td className="px-3 py-2">
                  <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs capitalize">{row.category.replace(/_/g, " ")}</span>
                </td>
                <td className="px-3 py-2 text-xs text-gray-500">{row.model_compatibility.slice(0, 3).join(", ")}
                  {row.model_compatibility.length > 3 ? ` +${row.model_compatibility.length - 3}` : ""}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{cents(row.typical_unit_cost_cents)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && !query.isLoading && <div className="px-3 py-6 text-center text-sm text-gray-400">No parts found.</div>}
        {query.isLoading && <div className="px-3 py-6 text-center text-sm text-gray-400">Loading parts…</div>}
      </div>

      {total > 50 && (
        <div className="flex items-center gap-2 text-sm">
          <button type="button" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="rounded border px-2 py-1 disabled:opacity-40">← Prev</button>
          <span>Page {page} of {Math.ceil(total / 50)}</span>
          <button type="button" disabled={page >= Math.ceil(total / 50)} onClick={() => setPage((p) => p + 1)} className="rounded border px-2 py-1 disabled:opacity-40">Next →</button>
        </div>
      )}
    </div>
  );
}
