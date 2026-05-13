import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { AccountingCatalogRow } from "../../../api/catalogs-accounting";
import { Button } from "../../../components/Button";
import { BackArrowHeader } from "../../../components/layout/BackArrowHeader";
import { ListErrorBanner } from "../../../components/shared/ListErrorBanner";
import { useCompanyContext } from "../../../contexts/CompanyContext";
import { AccountingCatalogModal, type AccountingCatalogClient, type AccountingMetadataField } from "./AccountingCatalogModal";
import { PAGE_SHELL_CLASS } from "../../../components/layout/pageShellClasses";

type Props = {
  client: AccountingCatalogClient & {
    list: (filters: {
      operating_company_id: string;
      search?: string;
      is_active?: "true" | "false" | "all";
      limit?: number;
      offset?: number;
    }) => Promise<{ rows: AccountingCatalogRow[]; total: number }>;
  };
  displayName: string;
  breadcrumbPath: string;
  codeLabel?: string;
  readOnly?: boolean;
  metadataFields?: AccountingMetadataField[];
  metadataSummary?: (row: AccountingCatalogRow) => string;
};

function statusPillClass(isActive: boolean) {
  return isActive
    ? "rounded bg-green-100 px-2 py-0.5 text-[10px] font-semibold text-green-700"
    : "rounded bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600";
}

export function AccountingCatalogListPage({
  client,
  displayName,
  breadcrumbPath,
  codeLabel = "Code",
  readOnly = false,
  metadataFields,
  metadataSummary,
}: Props) {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"true" | "false" | "all">("true");
  const [modalMode, setModalMode] = useState<"create" | "edit">("create");
  const [selectedRow, setSelectedRow] = useState<AccountingCatalogRow | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  const query = useQuery({
    queryKey: ["catalogs", "accounting", displayName, companyId, search, status],
    queryFn: () => client.list({ operating_company_id: companyId, search: search || undefined, is_active: status, limit: 200, offset: 0 }),
    enabled: Boolean(companyId),
  });

  const rows = query.data?.rows ?? [];
  const total = query.data?.total ?? 0;
  const emptyText = useMemo(() => {
    if (query.isLoading) return `Loading ${displayName.toLowerCase()}...`;
    if (rows.length > 0) return "";
    return `No ${displayName.toLowerCase()} found.`;
  }, [displayName, query.isLoading, rows.length]);

  return (
    <div className={`${PAGE_SHELL_CLASS} space-y-3`}>
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
      {query.isError ? <ListErrorBanner onRetry={() => void query.refetch()} /> : null}

      <div className="grid grid-cols-1 gap-2 rounded border border-gray-200 bg-white p-3 sm:grid-cols-2 lg:grid-cols-3">
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search by code or display name"
          className="h-9 rounded border border-gray-300 px-2 text-sm sm:col-span-2 lg:col-span-2"
        />
        <select value={status} onChange={(event) => setStatus(event.target.value as "true" | "false" | "all")} className="h-9 rounded border border-gray-300 px-2 text-sm">
          <option value="true">Active</option>
          <option value="false">Inactive</option>
          <option value="all">All</option>
        </select>
      </div>

      <div className="overflow-x-auto rounded border border-gray-200 bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-600">
            <tr>
              <th className="px-3 py-2 text-left">{codeLabel}</th>
              <th className="px-3 py-2 text-left">Display Name</th>
              <th className="px-3 py-2 text-left">Details</th>
              <th className="px-3 py-2 text-left">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.id}
                className={`border-t border-gray-100 ${readOnly ? "" : "cursor-pointer hover:bg-gray-50"}`}
                onClick={() => {
                  setModalMode("edit");
                  setSelectedRow(row);
                  setModalOpen(true);
                }}
              >
                <td className="px-3 py-2 text-xs font-medium tracking-normal [font-variant-ligatures:none]">{row.code || "—"}</td>
                <td className="px-3 py-2">{row.display_name}</td>
                <td className="px-3 py-2 text-xs text-slate-600">{metadataSummary ? metadataSummary(row) : row.description || "—"}</td>
                <td className="px-3 py-2">
                  <span className={statusPillClass(row.is_active)}>{row.is_active ? "Active" : "Inactive"}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {emptyText ? <div className="px-3 py-6 text-sm text-gray-500">{emptyText}</div> : null}
      </div>

      <AccountingCatalogModal
        open={modalOpen}
        readOnly={readOnly}
        operatingCompanyId={companyId}
        displayName={displayName}
        codeLabel={codeLabel}
        metadataFields={metadataFields}
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
