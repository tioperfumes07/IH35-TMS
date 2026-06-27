import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { listCargoClaimReasons, type CargoClaimCategory, type CargoClaimReasonRow } from "../../../api/catalogs-safety";
import { Button } from "../../../components/Button";
import { DataTable } from "../../../components/DataTable";
import { BackArrowHeader } from "../../../components/layout/BackArrowHeader";
import { useCompanyContext } from "../../../contexts/CompanyContext";
import { CargoClaimReasonModal } from "./CargoClaimReasonModal";
import { ListsSubNav } from "../ListsSubNav";
import { STATUS_OPTIONS, statusPillClass, type StatusFilter } from "./shared";
import { SelectCombobox } from "../../../components/shared/SelectCombobox";

const CATEGORY_LABELS: Record<CargoClaimCategory, string> = {
  damage: "Damage",
  shortage: "Shortage",
  loss: "Loss",
  delay: "Delay",
  temperature: "Temperature",
  contamination: "Contamination",
  theft: "Theft",
  concealed_damage: "Concealed Damage",
  other: "Other",
};

export function CargoClaimReasonsListPage() {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("true");
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedRow, setSelectedRow] = useState<CargoClaimReasonRow | null>(null);

  const query = useQuery({
    queryKey: ["catalogs", "safety", "cargo-claim-reasons", companyId, search, statusFilter],
    queryFn: () => listCargoClaimReasons(companyId, { search: search || undefined, is_active: statusFilter, limit: 200, offset: 0 }),
    enabled: Boolean(companyId),
  });

  const rows = query.data?.rows ?? [];
  const total = query.data?.total ?? 0;

  // TBL-STANDARD: shared DataTable columns (alignment per GLOBAL-TABLE-ALIGNMENT — text centers, numeric right).
  const columns = [
    { key: "reason_code", label: "Code", sortable: true, render: (row: CargoClaimReasonRow) => <span className="text-xs font-medium tracking-normal [font-variant-ligatures:none]">{row.reason_code}</span> },
    { key: "display_name", label: "Name", sortable: true },
    { key: "claim_category", label: "Category", sortable: true, render: (row: CargoClaimReasonRow) => (row.claim_category ? CATEGORY_LABELS[row.claim_category] : "—") },
    { key: "sort_order", label: "Order", sortable: true, numeric: true },
    { key: "is_active", label: "Status", sortable: true, render: (row: CargoClaimReasonRow) => <span className={statusPillClass(row.is_active)}>{row.is_active ? "Active" : "Inactive"}</span> },
  ];

  return (
    <div className="space-y-3">
      <ListsSubNav />
      <BackArrowHeader
        backTo="/lists"
        breadcrumb={["Lists & Catalogs", "Safety", "Cargo claim reasons"]}
        title="Cargo Claim Reasons"
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
        <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search by code or name" className="h-9 rounded border border-gray-300 px-2 text-sm md:col-span-2" />
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
        tableKey="safety-cargo-claim-reasons"
        errorState={
          query.isError
            ? { status: 0, message: "Failed to load cargo claim reasons.", onRetry: () => { void query.refetch(); } }
            : undefined
        }
      />

      <CargoClaimReasonModal
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
