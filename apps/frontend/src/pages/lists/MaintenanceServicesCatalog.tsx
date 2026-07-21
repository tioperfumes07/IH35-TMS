/**
 * CLOSURE-11 — MaintenanceServicesCatalog: searchable PM + repair services list.
 * Route: /lists/maintenance/services-catalog
 */
import { useState } from "react";
import { BackArrowHeader } from "../../components/layout/BackArrowHeader";
import { ListErrorState } from "../../components/ListErrorState";
import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { useMaintenanceServicesCatalog, type MaintenanceService } from "../../hooks/useMaintenanceServicesCatalog";
import { SelectCombobox } from "../../components/shared/SelectCombobox";

const APPLIES_TO = ["", "truck", "trailer", "reefer", "all"];
const PAGE_SIZE = 50;

function centsToDisplay(n: number) {
  return n > 0 ? `$${(n / 100).toFixed(0)}` : "—";
}

function statusBadge(isCritical: boolean) {
  return isCritical
    ? "rounded-sm bg-red-100 px-1.5 py-0.5 text-xs font-semibold text-red-700"
    : "rounded-sm bg-gray-100 px-1.5 py-0.5 text-xs text-gray-600";
}

function intervalDisplay(svc: MaintenanceService) {
  return (
    <>
      {svc.interval_miles ? `${svc.interval_miles.toLocaleString()} mi` : ""}
      {svc.interval_miles && svc.interval_months ? " / " : ""}
      {svc.interval_months ? `${svc.interval_months}mo` : ""}
      {svc.interval_hours ? `${svc.interval_hours}h` : ""}
      {!svc.interval_miles && !svc.interval_months && !svc.interval_hours ? "—" : ""}
    </>
  );
}

const SERVICES_COLUMNS: Array<ParityColumn<MaintenanceService>> = [
  {
    key: "service_code",
    label: "Code",
    sortable: true,
    render: (svc) => <span className="font-mono text-xs">{svc.service_code}</span>,
  },
  {
    key: "service_name",
    label: "Service",
    sortable: true,
    render: (svc) => <span className="font-medium">{svc.service_name}</span>,
  },
  {
    key: "service_category",
    label: "Category",
    sortable: true,
    render: (svc) => <span className="text-xs text-gray-500">{svc.service_category}</span>,
  },
  {
    key: "applies_to_type",
    label: "Applies To",
    sortable: true,
    render: (svc) => <span className="capitalize text-xs">{svc.applies_to_type}</span>,
  },
  {
    key: "interval_miles",
    label: "Interval",
    sortable: true,
    className: "text-right",
    sortValue: (svc) => svc.interval_miles ?? svc.interval_months ?? svc.interval_hours,
    render: (svc) => (
      <span className="block text-right text-xs tabular-nums text-gray-600">{intervalDisplay(svc)}</span>
    ),
  },
  {
    key: "typical_cost_cents",
    label: "Typical Cost",
    sortable: true,
    className: "text-right",
    sortValue: (svc) => svc.typical_cost_cents,
    render: (svc) => <span className="block text-right tabular-nums">{centsToDisplay(svc.typical_cost_cents)}</span>,
  },
  {
    key: "is_safety_critical",
    label: "Safety",
    sortable: true,
    sortValue: (svc) => (svc.is_safety_critical ? 0 : 1),
    render: (svc) => (
      <span className={statusBadge(svc.is_safety_critical)}>
        {svc.is_safety_critical ? "Critical" : "Routine"}
      </span>
    ),
  },
];

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

      <div className="grid gap-2 rounded-sm border border-gray-200 bg-white p-3 md:grid-cols-3">
        <input
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          placeholder="Search by code or service name"
          className="h-9 rounded-sm border border-gray-300 px-2 text-sm md:col-span-2"
        />
        <SelectCombobox value={appliesTo} onChange={(e) => { setAppliesTo(e.target.value); setPage(1); }} className="h-9 rounded-sm border border-gray-300 px-2 text-sm">
          {APPLIES_TO.map((t) => <option key={t} value={t}>{t || "All vehicle types"}</option>)}
        </SelectCombobox>
      </div>

      {query.isError ? (
        <ListErrorState
          title="Couldn't load services"
          status={0}
          message={(query.error as Error)?.message}
          onRetry={() => void query.refetch()}
        />
      ) : (
        <ParityTable
          rows={rows}
          columns={SERVICES_COLUMNS}
          rowKey={(svc) => svc.id}
          loading={query.isLoading}
          storageKey="maintenance-services-catalog"
          emptyText="No services found."
          tableTestId="maintenance-services-catalog-table"
          initialPageSize={PAGE_SIZE}
          pageSizeOptions={[PAGE_SIZE]}
        />
      )}

      {!query.isError && total > PAGE_SIZE && (
        <div className="flex items-center gap-2 text-sm">
          <button type="button" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="rounded-sm border px-2 py-1 disabled:opacity-40">← Prev</button>
          <span>Page {page} of {Math.ceil(total / PAGE_SIZE)}</span>
          <button type="button" disabled={page >= Math.ceil(total / PAGE_SIZE)} onClick={() => setPage((p) => p + 1)} className="rounded-sm border px-2 py-1 disabled:opacity-40">Next →</button>
        </div>
      )}
    </div>
  );
}
