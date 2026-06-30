import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { FleetCatalogRow } from "../../../api/catalogs-fleet";
import { Button } from "../../../components/Button";
import { DataTable } from "../../../components/DataTable";
import { BackArrowHeader } from "../../../components/layout/BackArrowHeader";
import { useCompanyContext } from "../../../contexts/CompanyContext";
import { FleetCatalogModal, type FleetCatalogClient } from "./FleetCatalogModal";
import { SelectCombobox } from "../../../components/shared/SelectCombobox";

type Props = {
  client: FleetCatalogClient & {
    list: (filters: {
      operating_company_id: string;
      search?: string;
      is_active?: "true" | "false" | "all";
      limit?: number;
      offset?: number;
    }) => Promise<{ rows: FleetCatalogRow[]; total: number }>;
  };
  displayName: string;
  breadcrumbPath: string;
  readOnly?: boolean;
};

function statusPillClass(isActive: boolean) {
  return isActive ? "rounded bg-green-100 px-2 py-0.5 text-[10px] font-semibold text-green-700" : "rounded bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600";
}

export function FleetCatalogListPage({ client, displayName, breadcrumbPath, readOnly = false }: Props) {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"true" | "false" | "all">("true");
  const [modalMode, setModalMode] = useState<"create" | "edit">("create");
  const [selectedRow, setSelectedRow] = useState<FleetCatalogRow | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  const query = useQuery({
    queryKey: ["catalogs", "fleet", displayName, companyId, search, status],
    queryFn: () => client.list({ operating_company_id: companyId, search: search || undefined, is_active: status, limit: 200, offset: 0 }),
    enabled: Boolean(companyId),
  });

  const rows = query.data?.rows ?? [];
  const total = query.data?.total ?? 0;

  // TBL-STANDARD: shared DataTable columns (alignment per GLOBAL-TABLE-ALIGNMENT — text centers, numeric right).
  const columns = [
    { key: "code", label: "Code", sortable: true, render: (row: FleetCatalogRow) => <span className="text-xs font-medium tracking-normal [font-variant-ligatures:none]">{row.code}</span> },
    { key: "display_name", label: "Display Name", sortable: true },
    { key: "description", label: "Description", sortable: true, render: (row: FleetCatalogRow) => row.description || "—" },
    { key: "sort_order", label: "Order", sortable: true, numeric: true },
    { key: "is_active", label: "Status", sortable: true, render: (row: FleetCatalogRow) => <span className={statusPillClass(row.is_active)}>{row.is_active ? "Active" : "Inactive"}</span> },
  ];

  return (
    <div className="space-y-3">
      <BackArrowHeader
        backTo="/lists"
        breadcrumb={breadcrumbPath.replace(/^Back · /, "").split(" · ")}
        title={displayName}
        countBadge={total}
        actions={
          !readOnly ? (
            <Button
              onClick={() => {
                setModalMode("create");
                setSelectedRow(null);
                setModalOpen(true);
              }}
            >
              + Create
            </Button>
          ) : undefined
        }
      />
      <div className="grid gap-2 rounded border border-gray-200 bg-white p-3 md:grid-cols-3">
        <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search by code or display name" className="h-9 rounded border border-gray-300 px-2 text-sm md:col-span-2" />
        <SelectCombobox value={status} onChange={(event) => setStatus(event.target.value as "true" | "false" | "all")} className="h-9 rounded border border-gray-300 px-2 text-sm">
          <option value="true">Active</option>
          <option value="false">Inactive</option>
          <option value="all">All</option>
        </SelectCombobox>
      </div>

      {/* TBL-STANDARD: shared DataTable (universal alignment + page-size + sort). Search/Status filters above
          feed `rows`; readOnly disables row-click → edit modal exactly as before. */}
      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(row) => row.id}
        onRowClick={
          readOnly
            ? undefined
            : (row) => {
                setModalMode("edit");
                setSelectedRow(row);
                setModalOpen(true);
              }
        }
        loading={query.isLoading}
        tableKey="catalogs-fleet"
        errorState={
          query.isError
            ? { status: 0, message: `Failed to load ${displayName.toLowerCase()}.`, onRetry: () => { void query.refetch(); } }
            : undefined
        }
      />

      <FleetCatalogModal
        open={modalOpen}
        operatingCompanyId={companyId}
        displayName={displayName}
        client={client}
        mode={modalMode}
        row={selectedRow}
        readOnly={readOnly}
        onClose={() => setModalOpen(false)}
        onSaved={() => {
          void query.refetch();
        }}
      />
    </div>
  );
}
