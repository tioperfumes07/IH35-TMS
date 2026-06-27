import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { listCompanyViolationTypes, type CompanyViolationTypeRow } from "../../../api/catalogs-safety";
import { Button } from "../../../components/Button";
import { DataTable } from "../../../components/DataTable";
import { BackArrowHeader } from "../../../components/layout/BackArrowHeader";
import { useCompanyContext } from "../../../contexts/CompanyContext";
import { CompanyViolationTypeModal } from "./CompanyViolationTypeModal";
import { ListsSubNav } from "../ListsSubNav";
import { STATUS_OPTIONS, statusPillClass, type StatusFilter } from "./shared";
import { SelectCombobox } from "../../../components/shared/SelectCombobox";

function severityBadgeClass(severity: number) {
  if (severity <= 3) return "rounded bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-700";
  if (severity <= 6) return "rounded bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-800";
  return "rounded bg-red-100 px-2 py-0.5 text-[10px] font-semibold text-red-700";
}

export function CompanyViolationTypesListPage() {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("true");
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedRow, setSelectedRow] = useState<CompanyViolationTypeRow | null>(null);

  const query = useQuery({
    queryKey: ["catalogs", "safety", "company-violation-types", companyId, search, statusFilter],
    queryFn: () => listCompanyViolationTypes(companyId, { search: search || undefined, is_active: statusFilter, limit: 200, offset: 0 }),
    enabled: Boolean(companyId),
  });

  const rows = query.data?.rows ?? [];
  const total = query.data?.total ?? 0;

  // TBL-STANDARD: shared DataTable columns (alignment per GLOBAL-TABLE-ALIGNMENT — text centers, numeric right).
  const columns = [
    { key: "type_code", label: "Type Code", sortable: true, render: (row: CompanyViolationTypeRow) => <span className="text-xs font-medium tracking-normal [font-variant-ligatures:none]">{row.type_code}</span> },
    { key: "type_name", label: "Type Name", sortable: true },
    { key: "default_severity", label: "Default Severity", sortable: true, render: (row: CompanyViolationTypeRow) => <span className={severityBadgeClass(Number(row.default_severity ?? 1))}>{Number(row.default_severity ?? 1)}</span> },
    { key: "amount_cents", label: "Default Fine", sortable: true, numeric: true, render: (row: CompanyViolationTypeRow) => (row.amount_cents ? `$${(row.amount_cents / 100).toFixed(2)}` : "—") },
    { key: "is_active", label: "Status", sortable: true, render: (row: CompanyViolationTypeRow) => <span className={statusPillClass(row.is_active)}>{row.is_active ? "Active" : "Inactive"}</span> },
  ];

  return (
    <div className="space-y-3">
      <ListsSubNav />
      <BackArrowHeader
        backTo="/lists"
        breadcrumb={["Lists & Catalogs", "Safety", "Company violation types"]}
        title="Company Violation Types"
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

      <div className="grid gap-2 rounded border border-gray-200 bg-white p-3 md:grid-cols-3">
        <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search by type code or type name" className="h-9 rounded border border-gray-300 px-2 text-sm md:col-span-2" />
        <SelectCombobox value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as StatusFilter)} className="h-9 rounded border border-gray-300 px-2 text-sm">
          {STATUS_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </SelectCombobox>
      </div>

      {/* TBL-STANDARD: shared DataTable (universal alignment + page-size + sort). Search/Status filters above
          feed `rows`; row-click → edit modal preserved exactly. */}
      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(row) => row.id}
        onRowClick={(row) => {
          setSelectedRow(row);
          setModalOpen(true);
        }}
        loading={query.isLoading}
        tableKey="safety-company-violation-types"
        errorState={
          query.isError
            ? { status: 0, message: "Failed to load company violation types.", onRetry: () => { void query.refetch(); } }
            : undefined
        }
      />

      <CompanyViolationTypeModal
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
