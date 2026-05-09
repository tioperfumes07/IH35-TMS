import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { MaintenanceCatalogRow } from "../../../api/catalogs-maintenance";
import { Button } from "../../../components/Button";
import { PageHeader } from "../../../components/layout/PageHeader";
import { ListErrorBanner } from "../../../components/shared/ListErrorBanner";
import { useCompanyContext } from "../../../contexts/CompanyContext";
import { MaintenanceCatalogModal, type MaintenanceCatalogClient } from "./MaintenanceCatalogModal";

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
  return isActive ? "rounded bg-green-100 px-2 py-0.5 text-[10px] font-semibold text-green-700" : "rounded bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600";
}

export function MaintenanceCatalogListPage({ client, displayName, breadcrumbPath }: Props) {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"true" | "false" | "all">("true");
  const [modalMode, setModalMode] = useState<"create" | "edit">("create");
  const [selectedRow, setSelectedRow] = useState<MaintenanceCatalogRow | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  const query = useQuery({
    queryKey: ["catalogs", "maintenance", displayName, companyId, search, status],
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
    <div className="space-y-3">
      <PageHeader title={displayName} subtitle={`${breadcrumbPath} · ${total} entries`} actions={<Button onClick={() => { setModalMode("create"); setSelectedRow(null); setModalOpen(true); }}>+ Create</Button>} />
      {query.isError ? <ListErrorBanner onRetry={() => void query.refetch()} /> : null}

      <div className="grid gap-2 rounded border border-gray-200 bg-white p-3 md:grid-cols-3">
        <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search by code or display name" className="h-9 rounded border border-gray-300 px-2 text-sm md:col-span-2" />
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
              <th className="px-3 py-2 text-left">Code</th>
              <th className="px-3 py-2 text-left">Display Name</th>
              <th className="px-3 py-2 text-left">Description</th>
              <th className="px-3 py-2 text-left">Order</th>
              <th className="px-3 py-2 text-left">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="cursor-pointer border-t border-gray-100 hover:bg-gray-50" onClick={() => { setModalMode("edit"); setSelectedRow(row); setModalOpen(true); }}>
                <td className="px-3 py-2 text-xs font-medium tracking-normal [font-variant-ligatures:none]">{row.code}</td>
                <td className="px-3 py-2">{row.display_name}</td>
                <td className="px-3 py-2">{row.description || "—"}</td>
                <td className="px-3 py-2">{row.sort_order}</td>
                <td className="px-3 py-2">
                  <span className={statusPillClass(row.is_active)}>{row.is_active ? "Active" : "Inactive"}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {emptyText ? <div className="px-3 py-6 text-sm text-gray-500">{emptyText}</div> : null}
      </div>

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
