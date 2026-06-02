import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getDocsFoundationKpis, listDocsFoundation, type DocsFoundationRow, type FileEntityType } from "../../api/docs";
import { PageHeader } from "../../components/layout/PageHeader";
import { SecondaryNavTabs } from "../../components/shared/SecondaryNavTabs";
import { useCompanyContext } from "../../contexts/CompanyContext";

const ENTITY_TABS: Array<{ id: FileEntityType | "all"; label: string }> = [
  { id: "all", label: "All Entities" },
  { id: "driver", label: "Drivers" },
  { id: "customer", label: "Customers" },
  { id: "vendor", label: "Vendors" },
  { id: "unit", label: "Units" },
  { id: "equipment", label: "Equipment" },
];

function fmtDate(value: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString();
}

function fmtFileSize(sizeBytes: string) {
  const numeric = Number(sizeBytes);
  if (!Number.isFinite(numeric) || numeric <= 0) return "—";
  if (numeric < 1024) return `${numeric} B`;
  if (numeric < 1024 * 1024) return `${Math.round(numeric / 102.4) / 10} KB`;
  return `${Math.round(numeric / (1024 * 102.4)) / 10} MB`;
}

export function DocsHomePage() {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const [activeTab, setActiveTab] = useState<FileEntityType | "all">("all");
  const [typeFilter, setTypeFilter] = useState("");
  const [expiresBefore, setExpiresBefore] = useState("");
  const [page, setPage] = useState(1);
  const limit = 25;

  const kpisQuery = useQuery({
    queryKey: ["docs", "foundation", "kpis", companyId],
    queryFn: () => getDocsFoundationKpis(companyId),
    enabled: Boolean(companyId),
  });

  const listQuery = useQuery({
    queryKey: ["docs", "foundation", "list", companyId, activeTab, typeFilter, expiresBefore, page, limit],
    queryFn: () =>
      listDocsFoundation({
        operating_company_id: companyId,
        entity: activeTab === "all" ? undefined : activeTab,
        type: typeFilter.trim() || undefined,
        expires_before: expiresBefore || undefined,
        page,
        limit,
      }),
    enabled: Boolean(companyId),
  });

  const rows = listQuery.data?.rows ?? [];
  const total = listQuery.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const canPrev = page > 1;
  const canNext = page < totalPages;
  const emptyState = useMemo(() => !listQuery.isLoading && rows.length === 0, [listQuery.isLoading, rows.length]);

  return (
    <div className="space-y-3">
      <PageHeader title="Documents" subtitle="Documents organized by entity with expiration tracking" />

      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        <KpiCard label="Total Docs" value={String(kpisQuery.data?.total_docs ?? 0)} />
        <KpiCard label="Expiring 30 Days" value={String(kpisQuery.data?.expiring_30_days ?? 0)} />
        <KpiCard label="Missing Required" value={String(kpisQuery.data?.missing_required ?? 0)} />
        <KpiCard label="Recent Uploads" value={String(kpisQuery.data?.recent_uploads ?? 0)} />
      </div>

      <SecondaryNavTabs
        tabs={ENTITY_TABS.map((tab) => ({ id: tab.id, label: tab.label }))}
        activeId={activeTab}
        onChange={(next) => {
          setActiveTab(next as FileEntityType | "all");
          setPage(1);
        }}
      />

      <section className="rounded border border-gray-200 bg-white p-3">
        <div className="mb-3 grid grid-cols-1 gap-2 md:grid-cols-3">
          <label className="space-y-1 text-xs font-semibold text-gray-600">
            Type filter
            <input
              value={typeFilter}
              onChange={(event) => {
                setTypeFilter(event.target.value);
                setPage(1);
              }}
              className="h-9 w-full rounded border border-gray-300 px-2 text-sm font-normal"
              placeholder="Category code, label, mime type"
            />
          </label>
          <label className="space-y-1 text-xs font-semibold text-gray-600">
            Expiration before
            <input
              type="date"
              value={expiresBefore}
              onChange={(event) => {
                setExpiresBefore(event.target.value);
                setPage(1);
              }}
              className="h-9 w-full rounded border border-gray-300 px-2 text-sm font-normal"
            />
          </label>
          <div className="flex items-end">
            <button
              type="button"
              className="h-9 rounded border border-gray-300 bg-white px-3 text-sm font-semibold text-gray-700 hover:bg-gray-50"
              onClick={() => {
                setTypeFilter("");
                setExpiresBefore("");
                setActiveTab("all");
                setPage(1);
              }}
            >
              Reset filters
            </button>
          </div>
        </div>

        {listQuery.isLoading ? <div className="h-20 animate-pulse rounded bg-slate-100" /> : null}
        {emptyState ? (
          <div className="rounded border border-dashed border-gray-300 p-6 text-center">
            <p className="text-base font-semibold text-gray-900">No documents found</p>
            <p className="mt-1 text-sm text-gray-600">No documents yet. Click + Upload Document to add one.</p>
            <button type="button" className="mt-3 rounded bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white opacity-70">
              + Upload Document
            </button>
          </div>
        ) : null}

        {!listQuery.isLoading && rows.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full table-fixed text-left text-sm">
              <thead className="bg-gray-50 text-xs uppercase text-gray-600">
                <tr>
                  <th className="px-2 py-1">File</th>
                  <th className="px-2 py-1">Type</th>
                  <th className="px-2 py-1">Entity</th>
                  <th className="px-2 py-1">Size</th>
                  <th className="px-2 py-1">Expires</th>
                  <th className="px-2 py-1">Uploaded</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <DocsRow key={row.id} row={row} />
                ))}
              </tbody>
            </table>
          </div>
        ) : null}

        <div className="mt-3 flex items-center justify-between text-xs text-gray-600">
          <span>Page {page} of {totalPages} · {total} total</span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="rounded border border-gray-300 px-2 py-1 disabled:opacity-50"
              disabled={!canPrev}
              onClick={() => setPage((current) => Math.max(1, current - 1))}
            >
              Previous
            </button>
            <button
              type="button"
              className="rounded border border-gray-300 px-2 py-1 disabled:opacity-50"
              disabled={!canNext}
              onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
            >
              Next
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}

function KpiCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-gray-200 bg-white px-3 py-2">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">{label}</div>
      <div className="text-lg font-semibold text-gray-900">{value}</div>
    </div>
  );
}

function DocsRow({ row }: { row: DocsFoundationRow }) {
  const firstLink = row.links?.[0];
  return (
    <tr className="border-t border-gray-100">
      <td className="truncate px-2 py-1">{row.original_filename}</td>
      <td className="truncate px-2 py-1">{row.type_label ?? row.type ?? "Uncategorized"}</td>
      <td className="truncate px-2 py-1">{firstLink ? `${firstLink.entity_type}:${firstLink.entity_id.slice(0, 8)}` : "—"}</td>
      <td className="truncate px-2 py-1">{fmtFileSize(row.size_bytes)}</td>
      <td className="truncate px-2 py-1">{fmtDate(row.expiration_date)}</td>
      <td className="truncate px-2 py-1">{fmtDate(row.created_at)}</td>
    </tr>
  );
}
