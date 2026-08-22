/**
 * CLOSURE-11 — MaintenanceServicesCatalog: searchable PM + repair services list.
 * Route: /lists/maintenance/services-catalog
 */
import { useState } from "react";
import { Button } from "../../components/Button";
import { BackArrowHeader } from "../../components/layout/BackArrowHeader";
import { ListErrorState } from "../../components/ListErrorState";
import { Modal } from "../../components/Modal";
import { MoneyInput } from "../../components/forms/MoneyInput";
import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { useCreateMaintenanceService, useMaintenanceServicesCatalog, type MaintenanceService } from "../../hooks/useMaintenanceServicesCatalog";
import { SelectCombobox } from "../../components/shared/SelectCombobox";

const APPLIES_TO = ["", "truck", "trailer", "reefer", "all"];
const PAGE_SIZE = 50;

type CreateForm = {
  service_code: string;
  service_name: string;
  service_category: string;
  applies_to_type: "truck" | "trailer" | "reefer" | "all";
  interval_miles: string;
  interval_months: string;
  interval_hours: string;
  is_safety_critical: boolean;
  typical_duration_hours: string;
  typical_cost_cents: number;
  compliance_ref: string;
};

const EMPTY_CREATE: CreateForm = {
  service_code: "",
  service_name: "",
  service_category: "",
  applies_to_type: "all",
  interval_miles: "",
  interval_months: "",
  interval_hours: "",
  is_safety_critical: false,
  typical_duration_hours: "",
  typical_cost_cents: 0,
  compliance_ref: "",
};

function positiveOrNull(value: string) {
  const parsed = Number(value);
  return value && Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

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
  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState<CreateForm>(EMPTY_CREATE);
  const [createError, setCreateError] = useState("");

  const query = useMaintenanceServicesCatalog(companyId, {
    search: search || undefined,
    applies_to: appliesTo || undefined,
    page,
  });
  const createMutation = useCreateMaintenanceService(companyId);

  const rows = query.data?.rows ?? [];
  const total = query.data?.total ?? 0;

  return (
    <div className="space-y-3">
      <BackArrowHeader
        backTo="/lists"
        breadcrumb={["Lists & Catalogs", "Maintenance", "Services Catalog"]}
        title="Maintenance Services Catalog"
        countBadge={total}
        actions={<Button onClick={() => { setCreateForm(EMPTY_CREATE); setCreateError(""); setCreateOpen(true); }}>+ Create</Button>}
      />

      <div className="grid gap-2 rounded-sm border border-gray-200 bg-white p-3 md:grid-cols-3">
        {/* MAINT-F3506: server-bound catalog search — keep; ParityTable toolbar Search suppressed */}
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
          // MAINT-F3506: keep API search above; hide ParityTable toolbar Search
          suppressToolbarSearch
        />
      )}

      {!query.isError && total > PAGE_SIZE && (
        <div className="flex items-center gap-2 text-sm">
          <button type="button" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="rounded-sm border px-2 py-1 disabled:opacity-40">← Prev</button>
          <span>Page {page} of {Math.ceil(total / PAGE_SIZE)}</span>
          <button type="button" disabled={page >= Math.ceil(total / PAGE_SIZE)} onClick={() => setPage((p) => p + 1)} className="rounded-sm border px-2 py-1 disabled:opacity-40">Next →</button>
        </div>
      )}

      <Modal variant="drawer" open={createOpen} onClose={() => setCreateOpen(false)} title="New Maintenance Service">
        <div className="space-y-3">
          <label className="block text-xs font-semibold text-gray-600">Code<input value={createForm.service_code} onChange={(e) => setCreateForm((v) => ({ ...v, service_code: e.target.value.toUpperCase() }))} className="mt-1 h-9 w-full rounded-sm border border-gray-300 px-2 text-sm" /></label>
          <label className="block text-xs font-semibold text-gray-600">Service Name<input value={createForm.service_name} onChange={(e) => setCreateForm((v) => ({ ...v, service_name: e.target.value }))} className="mt-1 h-9 w-full rounded-sm border border-gray-300 px-2 text-sm" /></label>
          <label className="block text-xs font-semibold text-gray-600">Category<input value={createForm.service_category} onChange={(e) => setCreateForm((v) => ({ ...v, service_category: e.target.value }))} className="mt-1 h-9 w-full rounded-sm border border-gray-300 px-2 text-sm" /></label>
          <label className="block text-xs font-semibold text-gray-600">Applies To<SelectCombobox value={createForm.applies_to_type} onChange={(e) => setCreateForm((v) => ({ ...v, applies_to_type: e.target.value as CreateForm["applies_to_type"] }))} className="mt-1 h-9 w-full"><option value="all">All</option><option value="truck">Truck</option><option value="trailer">Trailer</option><option value="reefer">Reefer</option></SelectCombobox></label>
          <div className="grid grid-cols-3 gap-2">
            <label className="block text-xs font-semibold text-gray-600">Miles<input type="number" min="1" value={createForm.interval_miles} onChange={(e) => setCreateForm((v) => ({ ...v, interval_miles: e.target.value }))} className="mt-1 h-9 w-full rounded-sm border border-gray-300 px-2 text-sm" /></label>
            <label className="block text-xs font-semibold text-gray-600">Months<input type="number" min="1" value={createForm.interval_months} onChange={(e) => setCreateForm((v) => ({ ...v, interval_months: e.target.value }))} className="mt-1 h-9 w-full rounded-sm border border-gray-300 px-2 text-sm" /></label>
            <label className="block text-xs font-semibold text-gray-600">Hours<input type="number" min="1" value={createForm.interval_hours} onChange={(e) => setCreateForm((v) => ({ ...v, interval_hours: e.target.value }))} className="mt-1 h-9 w-full rounded-sm border border-gray-300 px-2 text-sm" /></label>
          </div>
          <label className="block text-xs font-semibold text-gray-600">Typical Duration (hours)<input type="number" min="0" step="0.1" value={createForm.typical_duration_hours} onChange={(e) => setCreateForm((v) => ({ ...v, typical_duration_hours: e.target.value }))} className="mt-1 h-9 w-full rounded-sm border border-gray-300 px-2 text-sm" /></label>
          <label className="block text-xs font-semibold text-gray-600">Typical Cost<MoneyInput valueCents={createForm.typical_cost_cents} onChangeCents={(value) => setCreateForm((v) => ({ ...v, typical_cost_cents: value ?? 0 }))} ariaLabel="Typical cost" className="mt-1 w-full" /></label>
          <label className="block text-xs font-semibold text-gray-600">Compliance Reference<input value={createForm.compliance_ref} onChange={(e) => setCreateForm((v) => ({ ...v, compliance_ref: e.target.value }))} className="mt-1 h-9 w-full rounded-sm border border-gray-300 px-2 text-sm" /></label>
          <label className="flex items-center gap-2 text-xs text-gray-700"><input type="checkbox" checked={createForm.is_safety_critical} onChange={(e) => setCreateForm((v) => ({ ...v, is_safety_critical: e.target.checked }))} />Safety critical</label>
          {createError ? <div className="rounded-sm border border-red-300 bg-red-50 px-2 py-1 text-xs text-red-800">{createError}</div> : null}
          <div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => setCreateOpen(false)}>Cancel</Button><Button disabled={createMutation.isPending} onClick={() => void (async () => {
            if (!createForm.service_code.trim() || !createForm.service_name.trim() || !createForm.service_category.trim()) { setCreateError("Code, service name, and category are required."); return; }
            setCreateError("");
            try {
              await createMutation.mutateAsync({
                service_code: createForm.service_code.trim(), service_name: createForm.service_name.trim(), service_category: createForm.service_category.trim(), applies_to_type: createForm.applies_to_type,
                interval_miles: positiveOrNull(createForm.interval_miles), interval_months: positiveOrNull(createForm.interval_months), interval_hours: positiveOrNull(createForm.interval_hours),
                is_safety_critical: createForm.is_safety_critical, typical_duration_hours: positiveOrNull(createForm.typical_duration_hours), typical_cost_cents: createForm.typical_cost_cents,
                compliance_ref: createForm.compliance_ref.trim() || null, is_active: true,
              });
              setCreateOpen(false);
            } catch (error) { setCreateError(error instanceof Error ? error.message : "Failed to create service."); }
          })()}>Create</Button></div>
        </div>
      </Modal>
    </div>
  );
}
