import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { listCivilFineTypes, type CivilFineTypeRow } from "../../../api/catalogs-safety";
import { Button } from "../../../components/Button";
import { DataTable } from "../../../components/DataTable";
import { BackArrowHeader } from "../../../components/layout/BackArrowHeader";
import { useCompanyContext } from "../../../contexts/CompanyContext";
import { CivilFineTypeModal } from "./CivilFineTypeModal";
import { ListsSubNav } from "../ListsSubNav";
import { STATUS_OPTIONS, statusPillClass, type StatusFilter } from "./shared";
import { SelectCombobox } from "../../../components/shared/SelectCombobox";

export function CivilFineTypesListPage() {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("true");
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedRow, setSelectedRow] = useState<CivilFineTypeRow | null>(null);

  const query = useQuery({
    queryKey: ["catalogs", "safety", "civil-fine-types", companyId, search, statusFilter],
    queryFn: () => listCivilFineTypes(companyId, { search: search || undefined, is_active: statusFilter, limit: 200, offset: 0 }),
    enabled: Boolean(companyId),
  });

  const rows = query.data?.rows ?? [];
  const total = query.data?.total ?? 0;

  // TBL-STANDARD: shared DataTable columns (alignment per GLOBAL-TABLE-ALIGNMENT — text centers, numeric right).
  const columns = [
    { key: "code", label: "Code", sortable: true, render: (row: CivilFineTypeRow) => <span className="text-xs font-medium tracking-normal [font-variant-ligatures:none]">{row.code}</span> },
    { key: "display_name", label: "Display Name", sortable: true },
    { key: "description", label: "Description", sortable: true, render: (row: CivilFineTypeRow) => row.description || "—" },
    { key: "sort_order", label: "Order", sortable: true, numeric: true },
    { key: "is_active", label: "Status", sortable: true, render: (row: CivilFineTypeRow) => <span className={statusPillClass(row.is_active)}>{row.is_active ? "Active" : "Inactive"}</span> },
  ];

  return (
    <div className="space-y-3">
      <ListsSubNav />
      <BackArrowHeader
        backTo="/lists"
        breadcrumb={["Lists & Catalogs", "Safety", "Civil fine types"]}
        title="Civil Fine Types"
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
        <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search by code or display name" className="h-9 rounded border border-gray-300 px-2 text-sm md:col-span-2" />
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
        tableKey="safety-civil-fine-types"
        errorState={
          query.isError
            ? { status: 0, message: "Failed to load civil fine types.", onRetry: () => { void query.refetch(); } }
            : undefined
        }
      />

      <CivilFineTypeModal
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
