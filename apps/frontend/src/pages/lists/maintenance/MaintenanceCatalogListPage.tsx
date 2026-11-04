// TABLE_DATE_OMIT: this table has no date column by design — one row per catalog entry (code / name / order / status) — a reference list, not a time series.
import { useState } from "react";
import { fetchAllCatalogPages } from "../../../lib/fetchAllCatalogPages";
import { catalogListSearchQueryOptions } from "../../../hooks/catalogListSearchQueryOptions";
import { useQuery } from "@tanstack/react-query";
import type { MaintenanceCatalogRow } from "../../../api/catalogs-maintenance";
import { Button } from "../../../components/Button";
import { ListErrorState } from "../../../components/ListErrorState";
import { ParityTable } from "../../../components/parity/ParityTable";
import { BackArrowHeader } from "../../../components/layout/BackArrowHeader";
import { useCompanyContext } from "../../../contexts/CompanyContext";
import { useCreateQueryParam } from "../../../hooks/useCreateQueryParam";
import { MaintenanceCatalogModal, type MaintenanceCatalogClient } from "./MaintenanceCatalogModal";
import { MultiSelectDropdown } from "../../../components/forms/MultiSelectDropdown";

const STATUS_FILTER_OPTIONS = [
  { value: "true", label: "Active" },
  { value: "false", label: "Inactive" },
] as const;

function apiStatus(selected: string[]): "true" | "false" | "all" {
  if (selected.length === 1 && (selected[0] === "true" || selected[0] === "false")) return selected[0];
  return "all";
}

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
  const [status, setStatus] = useState<string[]>(["true"]);
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
    // (ParityTable's UniversalListToolbar) is the one search over all of it with "N of M" -- no 200-row cap.
    queryKey: ["catalogs", "maintenance", displayName, companyId, status.join(",") || "all"],
    queryFn: () => fetchAllCatalogPages(client.list, { operating_company_id: companyId, is_active: apiStatus(status) }),
    enabled: Boolean(companyId),
    ...catalogListSearchQueryOptions,
  });

  const allRows = query.data?.rows ?? [];
  const rows = allRows;
  const total = query.data?.total ?? 0;

  // TBL-STANDARD: shared ParityTable columns (alignment per GLOBAL-TABLE-ALIGNMENT — text centers, numeric right).
  const columns = [
    { key: "code", label: "Code", sortable: true, render: (row: MaintenanceCatalogRow) => <span className="text-xs font-medium tracking-normal [font-variant-ligatures:none]">{row.code}</span> },
    { key: "display_name", label: "Display Name", sortable: true },
    { key: "description", label: "Description", sortable: true, render: (row: MaintenanceCatalogRow) => row.description || "—" },
    { key: "sort_order", label: "Order", sortable: true, kind: "number" as const },
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
        <div className="text-xs font-semibold text-[#4B5563]" data-testid="catalog-status-filter">
          <span className="block">Status</span>
          <div className="mt-1">
            <MultiSelectDropdown
              label="Status"
              options={[...STATUS_FILTER_OPTIONS]}
              selected={status}
              onChange={(next) => {
                setStatus(next);
                setShowInactive(apiStatus(next) === "all");
              }}
              allLabel="All statuses"
              data-testid="catalog-status-multiselect"
            />
          </div>
        </div>
        <label className="flex items-center gap-2 text-xs text-gray-700">
          <input
            type="checkbox"
            checked={showVoided}
            onChange={(event) => {
              setShowInactive(event.target.checked);
              setStatus(event.target.checked ? ["true", "false"] : ["true"]);
            }}
            className="h-3.5 w-3.5 rounded-sm border-gray-300"
          />
          Show voided
        </label>
      </div>

      {/* TBL-STANDARD: shared ParityTable (universal alignment + page-size + sort). Search/Status filters above
          feed `rows`; row-click → edit modal preserved exactly. */}
      {query.isError ? (
        <ListErrorState
          title="Couldn't load list"
          status={0}
          message={`Failed to load ${displayName.toLowerCase()}.`}
          onRetry={() => { void query.refetch(); }}
        />
      ) : (
        <ParityTable
          columns={columns}
          rows={rows}
          rowKey={(row) => row.id}
          onRowClick={(row) => {
            setModalMode("edit");
            setSelectedRow(row);
            setModalOpen(true);
          }}
          loading={query.isLoading}
          storageKey="catalogs-maintenance"
          initialPageSize={50}
          title={status.length !== 1 ? "All entries" : status[0] === "false" ? "Inactive entries" : "Active entries"}
          allowAllPageSize
        />
      )}

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
