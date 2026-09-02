import { useState } from "react";
import { CatalogListSearchInput } from "../../../components/lists/CatalogListSearchInput";
import { catalogListSearchQueryOptions } from "../../../hooks/catalogListSearchQueryOptions";
import { useCreateQueryParam } from "../../../hooks/useCreateQueryParam";
import { useQuery } from "@tanstack/react-query";
import { listDotViolationTypes, type DotBasicCategory, type DotViolationTypeRow } from "../../../api/catalogs-safety";
import { Button } from "../../../components/Button";
import { DataTable } from "../../../components/DataTable";
import { BackArrowHeader } from "../../../components/layout/BackArrowHeader";
import { useCompanyContext } from "../../../contexts/CompanyContext";
import { DotViolationTypeModal } from "./DotViolationTypeModal";
import { ListsSubNav } from "../ListsSubNav";
import { statusPillClass, type StatusFilter } from "./shared";
import { CatalogStatusFilterCombobox } from "./CatalogStatusFilterCombobox";

const CATEGORY_LABELS: Record<DotBasicCategory, string> = {
  unsafe_driving: "Unsafe Driving",
  hours_of_service: "Hours of Service",
  driver_fitness: "Driver Fitness",
  controlled_substances: "Controlled Substances/Alcohol",
  vehicle_maintenance: "Vehicle Maintenance",
  crash_indicator: "Crash Indicator",
};

function severityBadgeClass(weight: number | null) {
  if (weight == null) return "rounded-sm bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-500";
  if (weight <= 3) return "rounded-sm bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700";
  if (weight <= 6) return "rounded-sm bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-800";
  return "rounded-sm bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700";
}

export function DotViolationTypesListPage() {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("true");
  const [modalOpen, setModalOpen] = useState(false);

  // LST-F5214 — Lists hub ?create=1 must open create modal (accounting catalog parity).
  useCreateQueryParam({
    companyId,
    onOpenCreate: () => {
      setSelectedRow(null);
      setModalOpen(true);
    },
  });
  const [selectedRow, setSelectedRow] = useState<DotViolationTypeRow | null>(null);

  const query = useQuery({
    queryKey: ["catalogs", "safety", "dot-violation-types", companyId, search, statusFilter],
    queryFn: () => listDotViolationTypes(companyId, { search: search || undefined, is_active: statusFilter, limit: 200, offset: 0 }),
    enabled: Boolean(companyId),
    ...catalogListSearchQueryOptions,
  });

  const rows = query.data?.rows ?? [];
  const total = query.data?.total ?? 0;

  // TBL-STANDARD: shared DataTable columns (alignment per GLOBAL-TABLE-ALIGNMENT — text centers, numeric right).
  const columns = [
    { key: "violation_code", label: "Code", sortable: true, render: (row: DotViolationTypeRow) => <span className="text-xs font-medium tracking-normal [font-variant-ligatures:none]">{row.violation_code}</span> },
    { key: "display_name", label: "Name", sortable: true },
    { key: "basic_category", label: "BASIC Category", sortable: true, render: (row: DotViolationTypeRow) => (row.basic_category ? CATEGORY_LABELS[row.basic_category] : "—") },
    { key: "severity_weight", label: "Severity", sortable: true, render: (row: DotViolationTypeRow) => <span className={severityBadgeClass(row.severity_weight)}>{row.severity_weight ?? "—"}</span> },
    { key: "is_oos", label: "OOS", sortable: true, render: (row: DotViolationTypeRow) => (row.is_oos ? "Yes" : "—") },
    { key: "is_active", label: "Status", sortable: true, render: (row: DotViolationTypeRow) => <span className={statusPillClass(row.is_active)}>{row.is_active ? "Active" : "Inactive"}</span> },
  ];

  return (
    <div className="space-y-3">
      <ListsSubNav />
      <BackArrowHeader
        backTo="/lists"
        breadcrumb={["Lists & Catalogs", "Safety", "DOT violation types"]}
        title="DOT Violation Types"
        countBadge={total}
        actions={
          <Button
            onClick={() => {
              setSelectedRow(null);
              setModalOpen(true);
            }}
          >
            + Create
          </Button>
        }
      />

      {/* LST list chrome — single outer frame; filter row is border-b only (no nested card above DataTable). */}
      <section
        className="overflow-hidden rounded-sm border border-gray-200 bg-white"
        data-testid="dot-violation-types-list-frame"
      >
        <div className="grid gap-2 border-b border-gray-200 bg-gray-50 p-3 md:grid-cols-3">
          <CatalogListSearchInput value={search} onChange={setSearch} placeholder="Search by code or name" className="h-9 rounded-sm border border-gray-300 px-2 text-sm md:col-span-2" />
          <CatalogStatusFilterCombobox value={statusFilter} onChange={setStatusFilter} />
        </div>

        {/* TBL-STANDARD: shared DataTable (universal alignment + page-size + sort). Search/Status filters above
            feed `rows`; row-click → edit modal preserved exactly. */}
        <div className="[&>div]:rounded-none [&>div]:border-0">
          <DataTable
            columns={columns}
            rows={rows}
            rowKey={(row) => row.id}
            onRowClick={(row) => {
              setSelectedRow(row);
              setModalOpen(true);
            }}
            loading={query.isLoading}
            tableKey="safety-dot-violation-types"
            errorState={
              query.isError
                ? { status: 0, message: "Failed to load DOT violation types.", onRetry: () => { void query.refetch(); } }
                : undefined
            }
          />
        </div>
      </section>

      <DotViolationTypeModal
        open={modalOpen}
        companyId={companyId}
        row={selectedRow}
        onClose={() => setModalOpen(false)}
        onSaved={() => {
          void query.refetch();
        }}
      />
    </div>
  );
}
