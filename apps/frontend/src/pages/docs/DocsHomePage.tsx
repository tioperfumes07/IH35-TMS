import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { DatePicker } from "../../components/forms/DatePicker";
import { useQuery } from "@tanstack/react-query";
import { getDocsFoundationDetail, getDocsFoundationKpis, listDocsFoundation, type DocsFoundationRow, type FileEntityType } from "../../api/docs";
import { PageHeader } from "../../components/layout/PageHeader";
import { ListErrorState } from "../../components/ListErrorState";
import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
import { CollapsedListFilters, useStagedListFilters } from "../../components/table";
import { SecondaryNavTabs } from "../../components/shared/SecondaryNavTabs";
import { UploadModal } from "../../components/documents/UploadModal";
import { PreviewModal } from "../../components/documents/PreviewModal";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { EntityLink, type EntityKind } from "../../components/shared/EntityLink";

type DocsEntityTabId = FileEntityType | "all";

/** Map docs.file_links.entity_type → EntityLink kind (equipment has no kind — show plain label). */
function docsLinkToEntityKind(entityType: FileEntityType): EntityKind | null {
  switch (entityType) {
    case "driver":
    case "customer":
    case "vendor":
    case "unit":
    case "load":
    case "settlement":
    case "invoice":
      return entityType;
    case "equipment":
      return "unit";
    default:
      return null;
  }
}

const ENTITY_TABS: Array<{ id: DocsEntityTabId; label: string }> = [
  { id: "all", label: "All Entities" },
  { id: "driver", label: "Drivers" },
  { id: "customer", label: "Customers" },
  { id: "vendor", label: "Vendors" },
  { id: "unit", label: "Units" },
  { id: "equipment", label: "Equipment" },
];
const DOCS_ENTITY_TAB_IDS = new Set<string>(ENTITY_TABS.map((tab) => tab.id));

function docsColumns(onPreview: (id: string) => void): Array<ParityColumn<DocsFoundationRow>> {
  return [
  {
    key: "original_filename",
    label: "File",
    sortable: true,
    render: (row) => (
      <button
        type="button"
        className="max-w-full truncate text-left font-medium text-slate-700 underline"
        onClick={() => onPreview(row.id)}
        data-testid="docs-file-preview-link"
      >
        {row.original_filename}
      </button>
    ),
  },
  {
    key: "type_label",
    label: "Type",
    sortable: true,
    sortValue: (row) => row.type_label ?? row.type ?? "Uncategorized",
    render: (row) => <span className="truncate">{row.type_label ?? row.type ?? "Uncategorized"}</span>,
  },
  {
    key: "entity",
    label: "Entity",
    sortable: true,
    sortValue: (row) => {
      return (row.links ?? []).map((link) => `${link.entity_type}:${link.entity_id}`).join("|");
    },
    render: (row) => {
      const links = row.links ?? [];
      if (links.length === 0) {
        return (
          <span className="truncate text-gray-400" data-testid="docs-entity-unlinked">
            —
          </span>
        );
      }
      return (
        <span className="flex min-w-0 flex-wrap gap-x-2 gap-y-1">
          {links.map((link) => {
            const kind = docsLinkToEntityKind(link.entity_type);
            const label = link.entity_label ?? undefined;
            if (!kind) {
              return (
                <span key={`${link.entity_type}:${link.entity_id}`} className="truncate" data-testid="docs-entity-plain">
                  {label ?? link.entity_type}
                </span>
              );
            }
            // DOCS-LINK-01: resolve the real human label; an explicit `entity_type` label would
            // suppress EntityLink's resolver and make every row read only "load"/"driver".
            return (
              <EntityLink
                key={`${link.entity_type}:${link.entity_id}`}
                kind={kind}
                id={link.entity_id}
                label={label}
                className="truncate"
                data-testid="docs-entity-link"
              />
            );
          })}
        </span>
      );
    },
  },
  {
    key: "size_bytes",
    label: "Size",
    sortable: true,
    sortValue: (row) => Number(row.size_bytes),
    render: (row) => <span className="truncate">{fmtFileSize(row.size_bytes)}</span>,
  },
  {
    key: "expiration_date",
    label: "Expires",
    sortable: true,
    sortValue: (row) => (row.expiration_date ? new Date(row.expiration_date).getTime() : null),
    render: (row) => <span className="truncate">{fmtDate(row.expiration_date)}</span>,
  },
  {
    key: "created_at",
    label: "Uploaded",
    sortable: true,
    sortValue: (row) => new Date(row.created_at).getTime(),
    render: (row) => <span className="truncate">{fmtDate(row.created_at)}</span>,
  },
  ];
}

export function parseDocsEntityTab(raw: string | null): DocsEntityTabId {
  if (raw && DOCS_ENTITY_TAB_IDS.has(raw)) return raw as DocsEntityTabId;
  return "all";
}

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
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = parseDocsEntityTab(searchParams.get("tab"));
  const setActiveTab = (next: DocsEntityTabId) => {
    const params = new URLSearchParams(searchParams);
    if (next === "all") params.delete("tab");
    else params.set("tab", next);
    setSearchParams(params, { replace: true });
  };
  const [typeFilter, setTypeFilter] = useState("");
  const [expiresBefore, setExpiresBefore] = useState("");
  /** KPI drill-down filters — lockstep with GET /api/v1/docs/kpis predicates (server-side; list is paginated). */
  const [kpiFilter, setKpiFilter] = useState<"none" | "missing_required" | "recent_uploads">("none");
  const staged = useStagedListFilters({
    applied: { typeFilter, expiresBefore }, empty: { typeFilter: "", expiresBefore: "" },
    onApply: (next) => { setTypeFilter(next.typeFilter); setExpiresBefore(next.expiresBefore); setPage(1); },
  });
  const [page, setPage] = useState(1);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [previewFileId, setPreviewFileId] = useState<string | null>(null);
  const limit = 25;

  const clearListFilters = () => {
    setTypeFilter("");
    setExpiresBefore("");
    setKpiFilter("none");
    setActiveTab("all");
    setPage(1);
  };

  const kpisQuery = useQuery({
    queryKey: ["docs", "foundation", "kpis", companyId],
    queryFn: () => getDocsFoundationKpis(companyId),
    enabled: Boolean(companyId),
  });

  const listQuery = useQuery({
    queryKey: ["docs", "foundation", "list", companyId, activeTab, typeFilter, expiresBefore, kpiFilter, page, limit],
    queryFn: () =>
      listDocsFoundation({
        operating_company_id: companyId,
        entity: activeTab === "all" ? undefined : activeTab,
        type: typeFilter.trim() || undefined,
        expires_before: expiresBefore || undefined,
        missing_required: kpiFilter === "missing_required" ? true : undefined,
        recent_uploads: kpiFilter === "recent_uploads" ? true : undefined,
        page,
        limit,
      }),
    enabled: Boolean(companyId),
  });

  const rows = listQuery.data?.rows ?? [];
  const previewQuery = useQuery({
    queryKey: ["docs", "foundation", "detail", companyId, previewFileId],
    queryFn: () => getDocsFoundationDetail(previewFileId!, companyId),
    enabled: Boolean(companyId && previewFileId),
  });
  const columns = docsColumns(setPreviewFileId);
  const total = listQuery.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const canPrev = page > 1;
  const canNext = page < totalPages;

  const filterBar = (
    <CollapsedListFilters
      activeFilterCount={(typeFilter ? 1 : 0) + (expiresBefore ? 1 : 0) + (kpiFilter !== "none" ? 1 : 0)}
      onApply={staged.apply} onReset={staged.reset} onCancel={staged.cancel} applyDisabled={!staged.dirty}
      testIdPrefix="docs"
      dataAttributes={{ "data-docs-filter-toolbar": "collapsed" }}
    >
      <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
        <label className="space-y-1 text-xs font-semibold text-gray-600">
          Type filter
          <input
            value={staged.draft.typeFilter}
            onChange={(event) => staged.setDraft({ ...staged.draft, typeFilter: event.target.value })}
            className="h-9 w-full rounded-sm border border-gray-300 px-2 text-sm font-normal"
            placeholder="Category code, label, mime type"
          />
        </label>
        <label className="space-y-1 text-xs font-semibold text-gray-600">
          Expiration before
          <DatePicker
            value={staged.draft.expiresBefore}
            onChange={(next) => staged.setDraft({ ...staged.draft, expiresBefore: next })}
            className="h-9 w-full font-normal"
          />
        </label>
        <div className="flex items-end gap-2">
          {kpiFilter !== "none" ? (
            <span className="pb-2 text-xs font-semibold text-gray-600">
              {kpiFilter === "missing_required"
                ? "Missing required (no category or incomplete upload)"
                : "Recent uploads (last 7 days)"}
            </span>
          ) : null}
        </div>
      </div>
    </CollapsedListFilters>
  );

  return (
    <div className="space-y-3">
      <PageHeader
        title="Documents"
        subtitle="Documents organized by entity with expiration tracking"
        actions={
          <button
            type="button"
            onClick={() => setUploadOpen(true)}
            disabled={!companyId}
            className="rounded-sm bg-[#1F2A44] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#0f1729] disabled:cursor-not-allowed disabled:opacity-50"
            data-testid="docs-home-upload-button"
          >
            + Upload Document
          </button>
        }
      />

      {!companyId ? (
        <p className="text-sm text-gray-500" data-testid="docs-home-need-company">
          Select an operating company to view documents and upload attachments.
        </p>
      ) : null}

      {uploadOpen && companyId ? (
        <UploadModal
          // FIX-2: this page's list/KPIs are scoped to `companyId` (the viewed company), so a
          // standalone upload with no operating_company_id can file under the uploader's default
          // company and never show up in this company-filtered list.
          operatingCompanyId={companyId}
          defaultLinkEntityType={
            activeTab === "driver" || activeTab === "customer" || activeTab === "vendor" || activeTab === "unit"
              ? activeTab
              : undefined
          }
          onClose={() => setUploadOpen(false)}
          onUploadSuccess={() => {
            setUploadOpen(false);
            void listQuery.refetch();
            void kpisQuery.refetch();
          }}
        />
      ) : null}

      {/* All four KPIs drill into the list via real filters (server predicates lockstep with /docs/kpis). */}
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        <KpiCard label="Total Docs" value={String(kpisQuery.data?.total_docs ?? 0)} onClick={clearListFilters} />
        <KpiCard
          label="Expiring 30 Days"
          value={String(kpisQuery.data?.expiring_30_days ?? 0)}
          onClick={() => {
            const in30 = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
            setKpiFilter("none");
            setExpiresBefore(in30);
            setPage(1);
          }}
        />
        <KpiCard
          label="Missing Required"
          value={String(kpisQuery.data?.missing_required ?? 0)}
          onClick={() => {
            setExpiresBefore("");
            setKpiFilter("missing_required");
            setPage(1);
          }}
        />
        <KpiCard
          label="Recent Uploads"
          value={String(kpisQuery.data?.recent_uploads ?? 0)}
          onClick={() => {
            setExpiresBefore("");
            setKpiFilter("recent_uploads");
            setPage(1);
          }}
        />
      </div>

      <SecondaryNavTabs
        tabs={ENTITY_TABS.map((tab) => ({ id: tab.id, label: tab.label }))}
        activeId={activeTab}
        onChange={(next) => {
          setActiveTab(next as DocsEntityTabId);
          setPage(1);
        }}
      />

      <section className="rounded-sm border border-gray-200 bg-white p-3">
        {listQuery.isError ? (
          <ListErrorState
            title="Couldn't load documents"
            status={0}
            message={(listQuery.error as Error)?.message}
            onRetry={() => void listQuery.refetch()}
          />
        ) : (
          <ParityTable
            rows={rows}
            columns={columns}
            rowKey={(row) => row.id}
            loading={listQuery.isLoading}
            filterBar={filterBar}
            storageKey="docs-home-page"
            emptyText="No documents found. Click + Upload Document to add one."
            tableTestId="docs-home-table"
            rowTestId={(row) => `docs-home-row-${row.id}`}
            initialPageSize={limit}
            pageSizeOptions={[limit]}
            exportFilename="documents"
          />
        )}

        {!listQuery.isError ? (
          <div className="mt-3 flex items-center justify-between text-xs text-gray-600">
            <span>
              Page {page} of {totalPages} · {total} total
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="rounded-sm border border-gray-300 px-2 py-1 disabled:opacity-50"
                disabled={!canPrev || listQuery.isLoading}
                onClick={() => setPage((current) => Math.max(1, current - 1))}
              >
                Previous
              </button>
              <button
                type="button"
                className="rounded-sm border border-gray-300 px-2 py-1 disabled:opacity-50"
                disabled={!canNext || listQuery.isLoading}
                onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
              >
                Next
              </button>
            </div>
          </div>
        ) : null}
      </section>

      {previewQuery.data ? (
        <PreviewModal
          file={previewQuery.data}
          canEditMetadata={false}
          onClose={() => setPreviewFileId(null)}
          onRequestEditMetadata={() => setPreviewFileId(null)}
        />
      ) : null}

      {previewFileId && previewQuery.isError ? (
        <ListErrorState
          title="Couldn't open document"
          status={0}
          message={(previewQuery.error as Error)?.message}
          onRetry={() => void previewQuery.refetch()}
        />
      ) : null}
    </div>
  );
}

function KpiCard({ label, value, onClick }: { label: string; value: string; onClick?: () => void }) {
  const content = (
    <>
      <div className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">{label}</div>
      <div className="text-lg font-semibold text-gray-900">{value}</div>
    </>
  );
  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className="rounded-sm border border-gray-200 bg-white px-3 py-2 text-left transition hover:shadow-xs"
      >
        {content}
      </button>
    );
  }
  return <div className="rounded-sm border border-gray-200 bg-white px-3 py-2">{content}</div>;
}
