import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getDownloadUrl, listFileCategories, listFiles, type DocsFile } from "../api/docs";
import { listUsers } from "../api/identity";
import { useAuth } from "../auth/useAuth";
import { Button } from "../components/Button";
import { Combobox } from "../components/Combobox";
import { DataTable } from "../components/DataTable";
import { PreviewModal } from "../components/documents/PreviewModal";
import { UploadModal } from "../components/documents/UploadModal";
import { PageHeader } from "../components/layout/PageHeader";
import { useToast } from "../components/Toast";
import { dataTableErrorState } from "../lib/tableError";

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

function entityLabel(file: DocsFile) {
  const firstLink = file.links?.[0];
  if (!firstLink) return "Standalone";
  return `${firstLink.entity_type[0].toUpperCase()}${firstLink.entity_type.slice(1)}: ${firstLink.entity_id.slice(0, 8)}...`;
}

export function DocumentsPage() {
  const { user } = useAuth();
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

  const filesQuery = useQuery({
    queryKey: ["all-documents-page", showDeleted],
    queryFn: () =>
      listFiles({
        include_deleted: showDeleted && isOwner,
        limit: 500,
        offset: 0,
      }).then((result) => result.files),
    enabled: isOwnerOrAdmin,
  });

  const filteredFiles = useMemo(() => {
    const now = new Date();
    return [...(filesQuery.data ?? [])]
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .filter((file) => {
        if (categoryFilter && file.category_id !== categoryFilter) return false;
        if (entityTypeFilter && entityTypeFilter !== "all") {
          if (entityTypeFilter === "standalone") {
            if (file.links && file.links.length > 0) return false;
          } else if (!file.links?.some((link) => link.entity_type === entityTypeFilter)) {
            return false;
          }
        }
        if (uploaderFilter && file.uploader_user_id !== uploaderFilter) return false;
        if (search.trim() && !file.original_filename.toLowerCase().includes(search.trim().toLowerCase())) return false;
        const compareDate = (file.document_date ?? file.created_at).slice(0, 10);
        if (dateFrom && compareDate < dateFrom) return false;
        if (dateTo && compareDate > dateTo) return false;
        if (expiringDays && expiringDays !== "none") {
          if (!file.expiration_date) return false;
          const threshold = new Date(now);
          threshold.setDate(threshold.getDate() + Number(expiringDays));
          if (new Date(file.expiration_date) > threshold) return false;
        }
        return true;
      });
  }, [filesQuery.data, categoryFilter, entityTypeFilter, uploaderFilter, search, dateFrom, dateTo, expiringDays]);

  if (!isOwnerOrAdmin) {
    return <div className="rounded border border-gray-200 bg-gray-50 p-3 text-sm text-gray-600">Only Owner/Administrator can access company-wide documents.</div>;
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
            className="rounded bg-[#16A34A] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#15803d]"
          >
            Upload document
          </button>
        }
      />
      {uploadOpen ? (
        <UploadModal
          onClose={() => setUploadOpen(false)}
          onUploadSuccess={() => {
            setUploadOpen(false);
            void filesQuery.refetch();
          }}
        />
      ) : null}

      <div className="grid gap-2 rounded border border-gray-200 bg-white p-3 md:grid-cols-4">
        <div className="space-y-1">
          <label className="text-xs font-semibold text-gray-600">Category</label>
          <Combobox
            options={(categoriesQuery.data ?? []).map((category) => ({ value: category.id, label: category.label, sublabel: category.code }))}
            value={categoryFilter}
            onChange={(value) => setCategoryFilter(value)}
            allowClear
            placeholder="All categories"
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-semibold text-gray-600">Entity Type</label>
          <Combobox
            options={ENTITY_TYPE_OPTIONS.map((option) => ({ value: option.value, label: option.label }))}
            value={entityTypeFilter}
            onChange={(value) => setEntityTypeFilter(value ?? "all")}
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-semibold text-gray-600">Uploader</label>
          <Combobox
            options={(usersQuery.data ?? []).map((entry) => ({
              value: entry.id,
              label: entry.email ?? entry.id,
              sublabel: entry.role,
            }))}
            value={uploaderFilter}
            onChange={(value) => setUploaderFilter(value)}
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
            onChange={(value) => setExpiringDays(value ?? "none")}
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-semibold text-gray-600">Date From</label>
          <input
            type="date"
            value={dateFrom}
            onChange={(event) => setDateFrom(event.target.value)}
            className="h-9 w-full rounded border border-gray-300 px-2 text-sm"
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-semibold text-gray-600">Date To</label>
          <input
            type="date"
            value={dateTo}
            onChange={(event) => setDateTo(event.target.value)}
            className="h-9 w-full rounded border border-gray-300 px-2 text-sm"
          />
        </div>
        <div className="space-y-1 md:col-span-2">
          <label className="text-xs font-semibold text-gray-600">Filename Search</label>
          <input
            type="text"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search filename"
            className="h-9 w-full rounded border border-gray-300 px-2 text-sm"
          />
        </div>
        {isOwner ? (
          <label className="flex items-center gap-2 text-xs text-gray-600 md:col-span-4">
            <input type="checkbox" checked={showDeleted} onChange={(event) => setShowDeleted(event.target.checked)} />
            Show deleted
          </label>
        ) : null}
      </div>

      <DataTable
        rows={filteredFiles}
        rowKey={(row) => row.id}
        loading={filesQuery.isLoading}
        errorState={dataTableErrorState(filesQuery.error, () => void filesQuery.refetch())}
        pageSize={50}
        onRowClick={(row) => setSelectedPreviewFile(row)}
        columns={[
          { key: "original_filename", label: "Filename" },
          { key: "category_label", label: "Category", render: (row) => row.category_label ?? "-" },
          { key: "entity", label: "Entity", render: (row) => entityLabel(row) },
          { key: "uploader_email", label: "Uploader", render: (row) => row.uploader_email ?? row.uploader_user_id },
          { key: "document_date", label: "Doc Date", render: (row) => (row.document_date ? row.document_date.slice(0, 10) : "-") },
          { key: "expiration_date", label: "Expires", render: (row) => (row.expiration_date ? row.expiration_date.slice(0, 10) : "-") },
          { key: "version_number", label: "Version", cellClass: "code-cell", render: (row) => `v${row.version_number}` },
          {
            key: "actions",
            label: "Actions",
            render: (row) => (
              <div className="flex gap-1" onClick={(event) => event.stopPropagation()}>
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
