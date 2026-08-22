/**
 * CLOSURE-10 — MaintenancePartsCatalog: enhanced parts by manufacturer with search + filter.
 * Route: /lists/maintenance/parts-catalog
 */
import { useState } from "react";
import { BackArrowHeader } from "../../components/layout/BackArrowHeader";
import { Button } from "../../components/Button";
import { ListErrorState } from "../../components/ListErrorState";
import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
import { SelectCombobox } from "../../components/shared/SelectCombobox";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { useMaintenancePartsCatalog, type MaintPartRow } from "../../hooks/useMaintenancePartsCatalog";
import { CreateMaintPartModal } from "./CreateMaintPartModal";

const MANUFACTURERS = ["", "Detroit Diesel", "Cummins", "Freightliner", "Peterbilt", "Kenworth"];
const CATEGORIES = [
  "", "engine", "transmission", "brake", "tire", "suspension",
  "electrical", "fuel_system", "cooling", "exhaust", "cabin",
  "reefer", "body", "fluid", "filter", "other",
];

function cents(n: number) {
  return n > 0 ? `$${(n / 100).toFixed(2)}` : "—";
}

const COLUMNS: Array<ParityColumn<MaintPartRow>> = [
  {
    key: "sku",
    label: "SKU",
    sortable: true,
    render: (row) => <span className="font-mono text-xs">{row.sku}</span>,
  },
  {
    key: "part_name",
    label: "Part Name",
    sortable: true,
    render: (row) => <span className="font-medium">{row.part_name}</span>,
  },
  {
    key: "manufacturer",
    label: "Manufacturer",
    sortable: true,
  },
  {
    key: "category",
    label: "Category",
    sortable: true,
    render: (row) => (
      <span className="rounded-sm bg-slate-100 px-1.5 py-0.5 text-xs capitalize">{row.category.replace(/_/g, " ")}</span>
    ),
  },
  {
    key: "model_compatibility",
    label: "Compatible Models",
    sortable: true,
    sortValue: (row) => row.model_compatibility.join(", "),
    render: (row) => (
      <span className="text-xs text-gray-500">
        {row.model_compatibility.slice(0, 3).join(", ")}
        {row.model_compatibility.length > 3 ? ` +${row.model_compatibility.length - 3}` : ""}
      </span>
    ),
  },
  {
    key: "typical_unit_cost_cents",
    label: "Typical Cost",
    sortable: true,
    className: "text-right",
    render: (row) => <span className="tabular-nums">{cents(row.typical_unit_cost_cents)}</span>,
  },
];

export function MaintenancePartsCatalog() {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const [search, setSearch] = useState("");
  const [manufacturer, setManufacturer] = useState("");
  const [category, setCategory] = useState("");
  const [page, setPage] = useState(1);
  const [createOpen, setCreateOpen] = useState(false);

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
        actions={
          <Button type="button" onClick={() => setCreateOpen(true)}>
            + Create
          </Button>
        }
      />

      <CreateMaintPartModal
        open={createOpen}
        operatingCompanyId={companyId}
        onClose={() => setCreateOpen(false)}
        onCreated={() => void query.refetch()}
      />

      <div className="grid gap-2 rounded-sm border border-gray-200 bg-white p-3 md:grid-cols-4">
        {/* MAINT-F3516: server-bound catalog search — keep; ParityTable toolbar Search suppressed */}
        <input
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          placeholder="Search by SKU, name, or UPC"
          className="h-9 rounded-sm border border-gray-300 px-2 text-sm md:col-span-2"
        />
        <SelectCombobox value={manufacturer} onChange={(e) => { setManufacturer(e.target.value); setPage(1); }} className="h-9 rounded-sm border border-gray-300 px-2 text-sm">
          {MANUFACTURERS.map((m) => <option key={m} value={m}>{m || "All manufacturers"}</option>)}
        </SelectCombobox>
        <SelectCombobox value={category} onChange={(e) => { setCategory(e.target.value); setPage(1); }} className="h-9 rounded-sm border border-gray-300 px-2 text-sm">
          {CATEGORIES.map((c) => <option key={c} value={c}>{c || "All categories"}</option>)}
        </SelectCombobox>
      </div>

      {query.isError ? (
        <ListErrorState
          title="Couldn't load parts catalog"
          status={(query.error as { status?: number })?.status ?? 0}
          message={(query.error as Error)?.message}
          onRetry={() => void query.refetch()}
        />
      ) : (
        <ParityTable
          columns={COLUMNS}
          rows={rows}
          rowKey={(row) => row.id}
          loading={query.isLoading}
          storageKey="maintenance-parts-catalog"
          tableTestId="maintenance-parts-catalog-table"
          emptyText="No parts found."
          initialPageSize={50}
          // MAINT-F3516: keep API search above; hide ParityTable toolbar Search
          suppressToolbarSearch
        />
      )}

      {total > 50 && (
        <div className="flex items-center gap-2 text-sm">
          <button type="button" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="rounded-sm border px-2 py-1 disabled:opacity-40">← Prev</button>
          <span>Page {page} of {Math.ceil(total / 50)}</span>
          <button type="button" disabled={page >= Math.ceil(total / 50)} onClick={() => setPage((p) => p + 1)} className="rounded-sm border px-2 py-1 disabled:opacity-40">Next →</button>
        </div>
      )}
    </div>
  );
}
