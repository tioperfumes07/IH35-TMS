import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { DriverCatalogRow } from "../../../api/catalogs-driver";
import { Button } from "../../../components/Button";
import { BackArrowHeader } from "../../../components/layout/BackArrowHeader";
import { ParityTable, type ParityColumn } from "../../../components/parity/ParityTable";
import { ListErrorBanner } from "../../../components/shared/ListErrorBanner";
import { useCompanyContext } from "../../../contexts/CompanyContext";
import { DriverCatalogModal, type DriverCatalogClient } from "./DriverCatalogModal";
import { SelectCombobox } from "../../../components/shared/SelectCombobox";

type OptionalBooleanField = { key: "may_draw_escrow"; label: string };

type Props = {
  client: DriverCatalogClient & {
    list: (filters: {
      operating_company_id: string;
      search?: string;
      is_active?: "true" | "false" | "all";
      limit?: number;
      offset?: number;
    }) => Promise<{ rows: DriverCatalogRow[]; total: number }>;
  };
  displayName: string;
  breadcrumbPath: string;
  /** Extra boolean columns (ND-ESC-01 may_draw_escrow on escrow_types). */
  optionalBooleans?: OptionalBooleanField[];
};

function statusPillClass(isActive: boolean) {
  return isActive
    ? "rounded-sm bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-700"
    : "rounded-sm bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600";
}

function buildColumns(optionalBooleans: OptionalBooleanField[]): Array<ParityColumn<DriverCatalogRow>> {
  const cols: Array<ParityColumn<DriverCatalogRow>> = [
    {
      key: "code",
      label: "Code",
      sortable: true,
      render: (row) => (
        <span className="text-xs font-medium tracking-normal [font-variant-ligatures:none]">{row.code}</span>
      ),
    },
    { key: "display_name", label: "Display Name", sortable: true },
    {
      key: "description",
      label: "Description",
      sortable: true,
      render: (row) => <>{row.description || "—"}</>,
    },
    { key: "sort_order", label: "Order", sortable: true },
  ];
  for (const field of optionalBooleans) {
    cols.push({
      key: field.key,
      label: field.label,
      sortable: true,
      sortValue: (row) => (row[field.key] ? "Yes" : "No"),
      render: (row) => (
        <span className={statusPillClass(Boolean(row[field.key]))}>{row[field.key] ? "Yes" : "No"}</span>
      ),
    });
  }
  cols.push({
    key: "is_active",
    label: "Status",
    sortable: true,
    sortValue: (row) => (row.is_active ? "Active" : "Inactive"),
    render: (row) => (
      <span className={statusPillClass(row.is_active)}>{row.is_active ? "Active" : "Inactive"}</span>
    ),
  });
  return cols;
}

export function DriverCatalogListPage({
  client,
  displayName,
  breadcrumbPath,
  optionalBooleans = [],
}: Props) {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"true" | "false" | "all">("true");
  const [modalMode, setModalMode] = useState<"create" | "edit">("create");
  const [selectedRow, setSelectedRow] = useState<DriverCatalogRow | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  const query = useQuery({
    queryKey: ["catalogs", "driver", displayName, companyId, search, status],
    queryFn: () =>
      client.list({
        operating_company_id: companyId,
        search: search || undefined,
        is_active: status,
        limit: 200,
        offset: 0,
      }),
    enabled: Boolean(companyId),
  });

  const rows = query.data?.rows ?? [];
  const total = query.data?.total ?? 0;
  const columns = buildColumns(optionalBooleans);

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
      {query.isError ? <ListErrorBanner onRetry={() => void query.refetch()} /> : null}

      <div className="grid gap-2 rounded-sm border border-gray-200 bg-white p-3 md:grid-cols-3">
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search by code or display name"
          className="h-9 rounded-sm border border-gray-300 px-2 text-sm md:col-span-2"
        />
        <SelectCombobox
          value={status}
          onChange={(event) => setStatus(event.target.value as "true" | "false" | "all")}
          className="h-9 rounded-sm border border-gray-300 px-2 text-sm"
        >
          <option value="true">Active</option>
          <option value="false">Inactive</option>
          <option value="all">All</option>
        </SelectCombobox>
      </div>

      <ParityTable
        columns={columns}
        rows={rows}
        rowKey={(row) => row.id}
        loading={query.isLoading}
        emptyText={`No ${displayName.toLowerCase()} found.`}
        storageKey="driver-catalog-list"
        tableTestId="driver-catalog-list-table"
        onRowClick={(row) => {
          setModalMode("edit");
          setSelectedRow(row);
          setModalOpen(true);
        }}
      />

      <DriverCatalogModal
        open={modalOpen}
        operatingCompanyId={companyId}
        displayName={displayName}
        client={client}
        mode={modalMode}
        row={selectedRow}
        optionalBooleans={optionalBooleans}
        onClose={() => setModalOpen(false)}
        onSaved={() => {
          void query.refetch();
        }}
      />
    </div>
  );
}
