import { useState } from "react";
import { fetchAllCatalogPages } from "../../../lib/fetchAllCatalogPages";
import { catalogListSearchQueryOptions } from "../../../hooks/catalogListSearchQueryOptions";
import { useQuery } from "@tanstack/react-query";
import type { MaintenanceCatalogRow } from "../../../api/catalogs-maintenance";
import { Button } from "../../../components/Button";
import { DataTable } from "../../../components/DataTable";
import { BackArrowHeader } from "../../../components/layout/BackArrowHeader";
import { useCompanyContext } from "../../../contexts/CompanyContext";
import { useCreateQueryParam } from "../../../hooks/useCreateQueryParam";
import { MaintenanceCatalogModal, type MaintenanceCatalogClient } from "./MaintenanceCatalogModal";
import { SelectCombobox } from "../../../components/Combobox";

type Props = {
  client: MaintenanceCatalogClient & {
    list: (filters: {
      operating_company_id: string;
      search?: string;
      is_active?: "true" | "false" | "all";
      limit?: number;
      offset?: number;
    }) => Promise<{ rows: MaintenanceCatalogRow[]; total: number }>;
  };
  displayName: string;
  breadcrumbPath: string;
};

function statusPillClass(isActive: boolean) {
  return isActive ? "rounded-sm bg-[#F7F8FA] px-2 py-0.5 text-xs font-semibold text-[#1F2A44]" : "rounded-sm bg-[#F7F8FA] px-2 py-0.5 text-xs font-semibold text-[#4B5563]";
}

export function MaintenanceCatalogListPage({ client, displayName, breadcrumbPath }: Props) {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const [status, setStatus] = useState<"true" | "false" | "all">("true");
  const [showVoided, setShowInactive] = useState(false);
  const [modalMode, setModalMode] = useState<"create" | "edit">("create");
  const [selectedRow, setSelectedRow] = useState<MaintenanceCatalogRow | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  // LST-F5214 — Lists hub ?create=1 must open create modal (accounting catalog parity).
  useCreateQueryParam({
    companyId,
    onOpenCreate: () => {
      setModalMode("create");
      setSelectedRow(null);
      setModalOpen(true);
    },
  });

  const query = useQuery({
    // Round 296: every row of the catalog (status narrows server-side on the indexed is_active), then the house toolbar
    // (DataTable's UniversalListToolbar) is the one search over all of it with "N of M" -- no 200-row cap.
    queryKey: ["catalogs", "maintenance", displayName, companyId, status],
    queryFn: () => fetchAllCatalogPages(client.list, { operating_company_id: companyId, is_active: status }),
    enabled: Boolean(companyId),
    ...catalogListSearchQueryOptions,
  });

  const allRows = query.data?.rows ?? [];
  const rows = allRows;
  const total = query.data?.total ?? 0;

  // TBL-STANDARD: shared DataTable columns (alignment per GLOBAL-TABLE-ALIGNMENT — text centers, numeric right).
  const columns = [
    { key: "code", label: "Code", sortable: true, render: (row: MaintenanceCatalogRow) => <span className="text-xs font-medium tracking-normal [font-variant-ligatures:none]">{row.code}</span> },
    { key: "display_name", label: "Display Name", sortable: true },
    { key: "description", label: "Description", sortable: true, render: (row: MaintenanceCatalogRow) => row.description || "—" },
    { key: "sort_order", label: "Order", sortable: true, numeric: true },
    { key: "is_active", label: "Status", sortable: true, render: (row: MaintenanceCatalogRow) => <span className={statusPillClass(row.is_active)}>{row.is_active ? "Active" : "Inactive"}</span> },
  ];

  return (
    <div className="space-y-3">
      <BackArrowHeader
        backTo="/lists"
        breadcrumb={breadcrumbPath.replace(/^Back · /, "").split(" · ")}
        title={displayName}
        countBadge={total}
        actions={
          <Button
            onClick={() => {
              setModalMode("create");
              setSelectedRow(null);
              setModalOpen(true);
            }}
          >
            + Create
          </Button>
        }
      />
      <div className="flex items-end gap-2 rounded-sm border border-gray-200 bg-white p-3">
        <SelectCombobox value={status} onChange={(event) => setStatus(event.target.value as "true" | "false" | "all")} className="h-9 rounded-sm border border-gray-300 px-2 text-xs">
          <option value="true">Active</option>
          <option value="false">Inactive</option>
          <option value="all">All</option>
        </SelectCombobox>
        <label className="flex items-center gap-2 text-xs text-gray-700">
          <input
            type="checkbox"
            checked={showVoided}
            onChange={(event) => {
              setShowInactive(event.target.checked);
              setStatus(event.target.checked ? "all" : "true");
            }}
            className="h-3.5 w-3.5 rounded-sm border-gray-300"
          />
          Show voided
        </label>
      </div>

      {/* TBL-STANDARD: shared DataTable (universal alignment + page-size + sort). Search/Status filters above
          feed `rows`; row-click → edit modal preserved exactly. */}
      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(row) => row.id}
        onRowClick={(row) => {
          setModalMode("edit");
          setSelectedRow(row);
          setModalOpen(true);
        }}
        loading={query.isLoading}
        tableKey="catalogs-maintenance"
        pageSize={50}
        errorState={
          query.isError
            ? { status: 0, message: `Failed to load ${displayName.toLowerCase()}.`, onRetry: () => { void query.refetch(); } }
            : undefined
        }
      />

      <MaintenanceCatalogModal
        open={modalOpen}
        operatingCompanyId={companyId}
        displayName={displayName}
        client={client}
        mode={modalMode}
        row={selectedRow}
        onClose={() => setModalOpen(false)}
        onSaved={() => {
          void query.refetch();
        }}
      />
    </div>
  );
}
