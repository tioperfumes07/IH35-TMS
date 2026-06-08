/**
 * CLOSURE-11 — MaintenanceServicesCatalog: searchable PM + repair services list.
 * Route: /lists/maintenance/services-catalog
 */
import { useState } from "react";
import { BackArrowHeader } from "../../components/layout/BackArrowHeader";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { useMaintenanceServicesCatalog } from "../../hooks/useMaintenanceServicesCatalog";
import { ListErrorBanner } from "../../components/shared/ListErrorBanner";
import { SelectCombobox } from "../../components/shared/SelectCombobox";

const APPLIES_TO = ["", "truck", "trailer", "reefer", "all"];

function centsToDisplay(n: number) {
  return n > 0 ? `$${(n / 100).toFixed(0)}` : "—";
}

function statusBadge(isCritical: boolean) {
  return isCritical
    ? "rounded bg-red-100 px-1.5 py-0.5 text-xs font-semibold text-red-700"
    : "rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-600";
}

export function MaintenanceServicesCatalog() {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const [search, setSearch] = useState("");
  const [appliesTo, setAppliesTo] = useState("");
  const [page, setPage] = useState(1);

  const query = useMaintenanceServicesCatalog(companyId, {
    search: search || undefined,
    applies_to: appliesTo || undefined,
    page,
  });

  const rows = query.data?.rows ?? [];
  const total = query.data?.total ?? 0;

  return (
    <div className="space-y-3">
      <BackArrowHeader
        backTo="/lists"
        breadcrumb={["Lists & Catalogs", "Maintenance", "Services Catalog"]}
        title="Maintenance Services Catalog"
        countBadge={total}
      />

      {query.isError && <ListErrorBanner onRetry={() => void query.refetch()} />}

      <div className="grid gap-2 rounded border border-gray-200 bg-white p-3 md:grid-cols-3">
        <input
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          placeholder="Search by code or service name"
          className="h-9 rounded border border-gray-300 px-2 text-sm md:col-span-2"
        />
        <SelectCombobox value={appliesTo} onChange={(e) => { setAppliesTo(e.target.value); setPage(1); }} className="h-9 rounded border border-gray-300 px-2 text-sm">
          {APPLIES_TO.map((t) => <option key={t} value={t}>{t || "All vehicle types"}</option>)}
        </SelectCombobox>
      </div>

      <div className="overflow-x-auto rounded border border-gray-200 bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-600">
            <tr>
              <th className="px-3 py-2 text-left">Code</th>
              <th className="px-3 py-2 text-left">Service</th>
              <th className="px-3 py-2 text-left">Category</th>
              <th className="px-3 py-2 text-left">Applies To</th>
              <th className="px-3 py-2 text-right">Interval</th>
              <th className="px-3 py-2 text-right">Typical Cost</th>
              <th className="px-3 py-2 text-left">Safety</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((svc) => (
              <tr key={svc.id} className="border-t border-gray-100 hover:bg-gray-50">
                <td className="px-3 py-2 font-mono text-xs">{svc.service_code}</td>
                <td className="px-3 py-2 font-medium">{svc.service_name}</td>
                <td className="px-3 py-2 text-xs text-gray-500">{svc.service_category}</td>
                <td className="px-3 py-2 capitalize text-xs">{svc.applies_to_type}</td>
                <td className="px-3 py-2 text-right text-xs tabular-nums text-gray-600">
                  {svc.interval_miles ? `${svc.interval_miles.toLocaleString()} mi` : ""}
                  {svc.interval_miles && svc.interval_months ? " / " : ""}
                  {svc.interval_months ? `${svc.interval_months}mo` : ""}
                  {svc.interval_hours ? `${svc.interval_hours}h` : ""}
                  {!svc.interval_miles && !svc.interval_months && !svc.interval_hours ? "—" : ""}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{centsToDisplay(svc.typical_cost_cents)}</td>
                <td className="px-3 py-2">
                  <span className={statusBadge(svc.is_safety_critical)}>
                    {svc.is_safety_critical ? "Critical" : "Routine"}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && !query.isLoading && <div className="px-3 py-6 text-center text-sm text-gray-400">No services found.</div>}
        {query.isLoading && <div className="px-3 py-6 text-center text-sm text-gray-400">Loading services…</div>}
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
