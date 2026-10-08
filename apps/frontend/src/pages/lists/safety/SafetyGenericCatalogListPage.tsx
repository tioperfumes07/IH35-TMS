import { useState } from "react";
import { fetchAllCatalogPages } from "../../../lib/fetchAllCatalogPages";
import { catalogListSearchQueryOptions } from "../../../hooks/catalogListSearchQueryOptions";
import { useQuery } from "@tanstack/react-query";
import type { SafetyGenericCatalogRow } from "../../../api/catalogs-safety";
import { Button } from "../../../components/Button";
import { BackArrowHeader } from "../../../components/layout/BackArrowHeader";
import { ParityTable, type ParityColumn } from "../../../components/parity/ParityTable";
import { ListErrorBanner } from "../../../components/shared/ListErrorBanner";
import { useCompanyContext } from "../../../contexts/CompanyContext";
import { useCreateQueryParam } from "../../../hooks/useCreateQueryParam";
import { SafetyGenericCatalogModal, type SafetyGenericCatalogClient } from "./SafetyGenericCatalogModal";
import { CatalogStatusFilterCombobox } from "./CatalogStatusFilterCombobox";

type Props = {
  client: SafetyGenericCatalogClient & {
    list: (filters: {
      operating_company_id: string;
      search?: string;
      is_active?: "true" | "false" | "all";
      limit?: number;
      offset?: number;
    }) => Promise<{ rows: SafetyGenericCatalogRow[]; total: number }>;
  };
  displayName: string;
  breadcrumbPath: string;
};

function statusPillClass(isActive: boolean) {
  return isActive
    ? "rounded-sm bg-[#F7F8FA] px-2 py-0.5 text-xs font-semibold text-[#1F2A44]"
    : "rounded-sm bg-[#F7F8FA] px-2 py-0.5 text-xs font-semibold text-[#4B5563]";
}

const COLUMNS: Array<ParityColumn<SafetyGenericCatalogRow>> = [
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
  {
    key: "is_active",
    label: "Status",
    sortable: true,
    sortValue: (row) => (row.is_active ? "Active" : "Inactive"),
    render: (row) => (
      <span className={statusPillClass(row.is_active)}>{row.is_active ? "Active" : "Inactive"}</span>
    ),
  },
];

export function SafetyGenericCatalogListPage({ client, displayName, breadcrumbPath }: Props) {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const [status, setStatus] = useState<"true" | "false" | "all">("true");
  const [showVoided, setShowInactive] = useState(false);
  const [modalMode, setModalMode] = useState<"create" | "edit">("create");
  const [selectedRow, setSelectedRow] = useState<SafetyGenericCatalogRow | null>(null);
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
    // Round 296: every row of the catalog (status narrows server-side on the indexed is_active; the route caps at
    // max(200) per page, so read page after page), then the house toolbar (ParityTable's UniversalListToolbar) is the
    // one search over all of it with "N of M". No page search box, no "Show voided" double filter.
    queryKey: ["catalogs", "safety-generic", displayName, companyId, status],
    queryFn: () => fetchAllCatalogPages(client.list, { operating_company_id: companyId, is_active: status }),
    enabled: Boolean(companyId),
    ...catalogListSearchQueryOptions,
  });

  const allRows = query.data?.rows ?? [];
  const rows = allRows;
  const total = query.data?.total ?? 0;

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

      <div className="flex items-end gap-2 rounded-sm border border-gray-200 bg-white p-3">
        <CatalogStatusFilterCombobox value={status} onChange={setStatus} />
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

      <ParityTable
        columns={COLUMNS}
        rows={rows}
        rowKey={(row) => row.id}
        loading={query.isLoading}
        emptyText={`No ${displayName.toLowerCase()} found.`}
        storageKey="safety-generic-catalog-list"
        tableTestId="safety-generic-catalog-list-table"
        onRowClick={(row) => {
          setModalMode("edit");
          setSelectedRow(row);
          setModalOpen(true);
        }}
      />

      <SafetyGenericCatalogModal
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
