import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getDownloadUrl, listFileCategories, listFiles, type DocsFile } from "../api/docs";
import { listUsers } from "../api/identity";
import { useAuth } from "../auth/useAuth";
import { useCompanyContext } from "../contexts/CompanyContext";
import { Button } from "../components/Button";
import { Combobox } from "../components/Combobox";
import { DataTable } from "../components/DataTable";
import { PreviewModal } from "../components/documents/PreviewModal";
import { UploadModal } from "../components/documents/UploadModal";
import { SettlementRefCell } from "../components/shared/SettlementRefCell";
import { PageHeader } from "../components/layout/PageHeader";
import { useToast } from "../components/Toast";
import { dataTableErrorState } from "../lib/tableError";
import { formatDateUS } from "../lib/formatDate";
import { entityLabel } from "../lib/entity-label";
import { entityLabel as formatEntityLabel } from "../lib/entity-label";
import { DatePicker } from "../components/forms/DatePicker";
import { UniversalListToolbar } from "../components/table/UniversalListToolbar";
import type { FileEntityType } from "../api/docs";

const ENTITY_TYPE_OPTIONS = [
  { value: "all", label: "All" },
  { value: "driver", label: "Driver" },
  { value: "customer", label: "Customer" },
  { value: "vendor", label: "Vendor" },
  { value: "unit", label: "Unit" },
  { value: "equipment", label: "Equipment" },
  { value: "load", label: "Load" },
  { value: "settlement", label: "Settlement" },
  { value: "invoice", label: "Invoice" },
  { value: "standalone", label: "Standalone" },
] as const;

function docsFileEntityLabel(file: DocsFile) {
  const firstLink = file.links?.[0];
  if (!firstLink) return "Standalone";
  const entityType = `${firstLink.entity_type[0].toUpperCase()}${firstLink.entity_type.slice(1)}`;
  return firstLink.entity_label ? `${entityType}: ${firstLink.entity_label}` : entityType;
}

export function DocumentsPage() {
  const { user } = useAuth();
  const { selectedCompanyId } = useCompanyContext();
  const { pushToast } = useToast();
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [entityTypeFilter, setEntityTypeFilter] = useState<string | null>("all");
  const [uploaderFilter, setUploaderFilter] = useState<string | null>(null);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [expiringDays, setExpiringDays] = useState<string | null>("none");
  const [search, setSearch] = useState("");
  const [showDeleted, setShowDeleted] = useState(false);
  const [selectedPreviewFile, setSelectedPreviewFile] = useState<DocsFile | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [page, setPage] = useState(1);
  // DOCS-fix: the backend's GET /api/v1/docs/files caps `limit` at 200 (files.routes.ts
  // listQuerySchema.max(200)); this page was requesting limit:500, which zod rejects with a
  // validation_error, so the entire library errored out on every load. Match the server cap and
  // page through the results server-side instead (also closes the punchlist #84 "rows past 500
  // are unreachable" gap).
  const PAGE_SIZE = 200;

  const isOwnerOrAdmin = user?.role === "Owner" || user?.role === "Administrator";
  const isOwner = user?.role === "Owner";

  const categoriesQuery = useQuery({
    queryKey: ["file-categories", "all-documents-page"],
    queryFn: () => listFileCategories().then((result) => result.categories.filter((category) => category.is_active)),
    enabled: isOwnerOrAdmin,
  });

  const usersQuery = useQuery({
    queryKey: ["identity-users", "for-documents-filters"],
    queryFn: () => listUsers(true).then((result) => result.users.filter((entry) => !entry.deactivated_at)),
    enabled: isOwnerOrAdmin,
  });

  // Round 296 filter law: this library pages server-side (route max 200), so EVERY filter runs on the server over the
  // whole library -- it used to filter one page in the browser and show that page's count. "N of M" = the filtered
  // total of the library total. Any filter change returns to page 1.
  const filters = {
    category: categoryFilter ?? undefined,
    entity_type:
      entityTypeFilter && entityTypeFilter !== "all" && entityTypeFilter !== "standalone"
        ? (entityTypeFilter as FileEntityType)
        : undefined,
    standalone: entityTypeFilter === "standalone" ? true : undefined,
    uploader_user_id: uploaderFilter ?? undefined,
    q: search.trim() || undefined,
    date_from: dateFrom || undefined,
    date_to: dateTo || undefined,
    expires_within_days: expiringDays && expiringDays !== "none" ? Number(expiringDays) : undefined,
  };
  const filesQuery = useQuery({
    queryKey: ["all-documents-page", selectedCompanyId, showDeleted, page, filters],
    queryFn: () => {
      if (!selectedCompanyId) throw new Error("Operating company is required to list documents");
      return listFiles({
        operating_company_id: selectedCompanyId,
        include_deleted: showDeleted && isOwner,
        limit: PAGE_SIZE,
        offset: (page - 1) * PAGE_SIZE,
        ...filters,
      });
    },
    enabled: isOwnerOrAdmin && Boolean(selectedCompanyId),
  });
  const files = filesQuery.data?.files ?? [];
  const totalFiles = filesQuery.data?.total ?? 0;
  const libraryTotal = filesQuery.data?.library_total ?? totalFiles;
  const totalPages = Math.max(1, Math.ceil(totalFiles / PAGE_SIZE));
  const resetPage = <T,>(set: (value: T) => void) => (value: T) => {
    set(value);
    setPage(1);
  };

  if (!isOwnerOrAdmin) {
    return <div className="rounded-sm border border-gray-200 bg-gray-50 p-3 text-xs text-gray-600">Only Owner/Administrator can access company-wide documents.</div>;
  }

  return (
    <div className="space-y-3">
      <PageHeader
        title="All Documents"
        subtitle="Company-wide documents library"
        actions={
          <button
            type="button"
            onClick={() => setUploadOpen(true)}
            className="rounded-sm bg-[#1F2A44] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#0F1729]"
          >
            Upload document
          </button>
        }
      />
      {uploadOpen ? (
        <UploadModal
          operatingCompanyId={selectedCompanyId ?? undefined}
          onClose={() => setUploadOpen(false)}
          onUploadSuccess={() => {
            setUploadOpen(false);
            void filesQuery.refetch();
          }}
        />
      ) : null}

      <div className="grid gap-2 rounded-sm border border-gray-200 bg-white p-3 md:grid-cols-4">
        <div className="space-y-1">
          <label className="text-xs font-semibold text-gray-600">Category</label>
          <Combobox
            options={(categoriesQuery.data ?? []).map((category) => ({ value: category.id, label: category.label, sublabel: category.code }))}
            value={categoryFilter}
            onChange={resetPage(setCategoryFilter)}
            allowClear
            placeholder="All categories"
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-semibold text-gray-600">Entity Type</label>
          <Combobox
            options={ENTITY_TYPE_OPTIONS.map((option) => ({ value: option.value, label: option.label }))}
            value={entityTypeFilter}
            onChange={(value) => resetPage(setEntityTypeFilter)(value ?? "all")}
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-semibold text-gray-600">Uploader</label>
          <Combobox
            options={(usersQuery.data ?? []).map((entry) => ({
              value: entry.id,
              label: entityLabel(entry.email, entry.id, "User"),
              sublabel: entry.role,
            }))}
            value={uploaderFilter}
            onChange={resetPage(setUploaderFilter)}
            allowClear
            placeholder="All uploaders"
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-semibold text-gray-600">Expiring Within</label>
          <Combobox
            options={[
              { value: "none", label: "No filter" },
              { value: "30", label: "30 days" },
              { value: "60", label: "60 days" },
              { value: "90", label: "90 days" },
            ]}
            value={expiringDays}
            onChange={(value) => resetPage(setExpiringDays)(value ?? "none")}
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-semibold text-gray-600">Date From</label>
          <DatePicker box="filter" value={dateFrom} onChange={resetPage(setDateFrom)} />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-semibold text-gray-600">Date To</label>
          <DatePicker box="filter" value={dateTo} onChange={resetPage(setDateTo)} />
        </div>
        {isOwner ? (
          <label className="flex items-center gap-2 text-xs text-gray-600 md:col-span-4">
            <input
              type="checkbox"
              checked={showDeleted}
              onChange={(event) => {
                setShowDeleted(event.target.checked);
                setPage(1);
              }}
            />
            Show deleted
          </label>
        ) : null}
      </div>

      {/* House toolbar for a server-paged list: search drives the server `q`; N of M = filtered of library. */}
      <UniversalListToolbar
        search={search}
        onSearchChange={resetPage(setSearch)}
        columns={[]}
        range={null}
        onRangeApply={() => undefined}
        hideRange
        resultCount={totalFiles}
        totalCount={libraryTotal}
        searchPlaceholder="Search filename"
      />

      <DataTable
        rows={files}
        hideToolbar
        rowKey={(row) => row.id}
        loading={filesQuery.isLoading}
        errorState={dataTableErrorState(filesQuery.error, () => void filesQuery.refetch())}
        pageSize={50}
        onRowClick={(row) => setSelectedPreviewFile(row)}
        columns={[
          { key: "original_filename", label: "Filename", sortable: true },
          { key: "category_label", label: "Category", sortable: true, render: (row) => row.category_label ?? "-" },
          // Not sortable: a composite entity label (name resolved through several possible FKs),
          // not a single orderable field.
          {
            key: "entity",
            label: "Entity",
            sortable: false,
            render: (row) => {
              const loadLink = row.links?.find((link) => link.entity_type === "load");
              // ALL-SEATS LAW (owner, 2026-09-13): a settlement/tour number beside every load
              // number. Documents is a generic multi-entity surface — the cell only appears when
              // THIS row's link happens to be a load; every other entity type (driver, customer,
              // vendor, unit, equipment, settlement, invoice, standalone) renders exactly as before.
              if (!loadLink || !selectedCompanyId) return docsFileEntityLabel(row);
              return (
                <span className="flex items-center gap-1.5">
                  <span>{docsFileEntityLabel(row)}</span>
                  <SettlementRefCell loadId={loadLink.entity_id} operatingCompanyId={selectedCompanyId} />
                </span>
              );
            },
          },
          { key: "uploader_email", label: "Uploader", sortable: true, render: (row) => formatEntityLabel(row.uploader_email, row.uploader_user_id, "User") },
          { key: "document_date", label: "Doc Date", sortable: true, render: (row) => formatDateUS(row.document_date) || "-" },
          { key: "expiration_date", label: "Expires", sortable: true, render: (row) => formatDateUS(row.expiration_date) || "-" },
          { key: "version_number", label: "Version", sortable: true, cellClass: "code-cell", render: (row) => `v${row.version_number}` },
          {
            key: "actions",
            label: "Actions",
            sortable: false,
            render: (row) => (
              <div className="flex gap-1" onClick={(event: { stopPropagation(): void }) => event.stopPropagation()}>
                <Button size="sm" variant="secondary" onClick={() => setSelectedPreviewFile(row)}>
                  Preview
                </Button>
                <Button
                  size="sm"
                  onClick={async () => {
                    try {
                      const result = await getDownloadUrl(row.id);
                      window.open(result.presigned_url, "_blank", "noopener,noreferrer");
                    } catch {
                      pushToast("Unable to get download URL.", "error");
                    }
                  }}
                >
                  Download
                </Button>
              </div>
            ),
          },
        ]}
      />

      <div className="flex items-center justify-between text-xs text-gray-600">
        <span>
          Page {page} of {totalPages} · {totalFiles} total
        </span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="rounded-sm border border-gray-300 px-2 py-1 disabled:opacity-50"
            disabled={page <= 1}
            onClick={() => setPage((current) => Math.max(1, current - 1))}
          >
            Previous
          </button>
          <button
            type="button"
            className="rounded-sm border border-gray-300 px-2 py-1 disabled:opacity-50"
            disabled={page >= totalPages}
            onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
          >
            Next
          </button>
        </div>
      </div>

      {selectedPreviewFile ? (
        <PreviewModal
          file={selectedPreviewFile}
          canEditMetadata={false}
          onClose={() => setSelectedPreviewFile(null)}
          onRequestEditMetadata={() => {
            setSelectedPreviewFile(null);
          }}
        />
      ) : null}
    </div>
  );
}
