import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError } from "../../api/client";
import {
  getDownloadUrl,
  listFileCategories,
  listFiles,
  restoreFile,
  type DocsFile,
} from "../../api/docs";
import { useAuth } from "../../auth/useAuth";
import { Button } from "../Button";
import { Combobox } from "../Combobox";
import { DataTable } from "../DataTable";
import { useToast } from "../Toast";
import { EditMetadataModal } from "./EditMetadataModal";
import { PreviewModal } from "./PreviewModal";
import { SoftDeleteModal } from "./SoftDeleteModal";
import { UploadModal } from "./UploadModal";
import { VersionHistoryModal } from "./VersionHistoryModal";

type DocumentsTabProps = {
  entityType: "driver" | "customer" | "vendor" | "unit" | "equipment" | "load";
  entityId: string;
  entityName: string;
};

function formatDate(value: string | null) {
  if (!value) return "-";
  return new Date(value).toISOString().slice(0, 10);
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export function DocumentsTab({ entityType, entityId, entityName }: DocumentsTabProps) {
  const queryClient = useQueryClient();
  const { pushToast } = useToast();
  const { user } = useAuth();

  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [showDeleted, setShowDeleted] = useState(false);

  const [uploadOpen, setUploadOpen] = useState(false);
  const [selectedPreviewFile, setSelectedPreviewFile] = useState<DocsFile | null>(null);
  const [selectedEditFile, setSelectedEditFile] = useState<DocsFile | null>(null);
  const [selectedDeleteFile, setSelectedDeleteFile] = useState<DocsFile | null>(null);
  const [selectedVersionFile, setSelectedVersionFile] = useState<DocsFile | null>(null);

  const canUpload = user?.role === "Owner" || user?.role === "Administrator" || user?.role === "Manager";
  const isOwner = user?.role === "Owner";
  const canEdit = canUpload;
  const canDelete = canUpload;
  const hasValidEntityId = isUuid(entityId);

  const categoriesQuery = useQuery({
    queryKey: ["file-categories", entityType],
    queryFn: () => listFileCategories(entityType).then((result) => result.categories.filter((category) => category.is_active)),
  });

  const filesQuery = useQuery({
    queryKey: ["docs-files", entityType, entityId, showDeleted],
    queryFn: () =>
      listFiles({
        entity_type: entityType,
        entity_id: entityId,
        include_deleted: showDeleted && isOwner,
        limit: 200,
        offset: 0,
      }).then((result) => result.files),
    enabled: hasValidEntityId,
  });

  const restoreMutation = useMutation({
    mutationFn: (fileId: string) => restoreFile(fileId),
    onSuccess: () => {
      pushToast("Document restored", "success");
      void queryClient.invalidateQueries({ queryKey: ["docs-files", entityType, entityId] });
    },
    onError: () => pushToast("Failed to restore file", "error"),
  });

  const filteredFiles = useMemo(() => {
    const source = [...(filesQuery.data ?? [])].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    return source.filter((file) => {
      if (categoryFilter && file.category_id !== categoryFilter) return false;
      if (search.trim()) {
        const query = search.trim().toLowerCase();
        if (!file.original_filename.toLowerCase().includes(query)) return false;
      }
      const compareDate = file.document_date ?? file.created_at;
      const compareDay = compareDate.slice(0, 10);
      if (dateFrom && compareDay < dateFrom) return false;
      if (dateTo && compareDay > dateTo) return false;
      return true;
    });
  }, [filesQuery.data, categoryFilter, search, dateFrom, dateTo]);

  const documentsError =
    !hasValidEntityId
      ? "Invalid record identifier. Documents cannot load for this record."
      : filesQuery.error instanceof ApiError && filesQuery.error.status === 400
      ? "Invalid documents query. Please refresh."
      : filesQuery.error instanceof ApiError && filesQuery.error.status === 403
      ? "You do not have permission to view documents for this record."
      : filesQuery.isError
      ? "Unable to load documents."
      : null;

  async function handleDownload(file: DocsFile) {
    try {
      const response = await getDownloadUrl(file.id);
      window.open(response.presigned_url, "_blank", "noopener,noreferrer");
    } catch (error) {
      if (error instanceof ApiError && error.status === 503) {
        pushToast("R2 is not configured.", "error");
        return;
      }
      pushToast("Unable to get download URL.", "error");
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between rounded border border-gray-200 bg-white px-3 py-2">
        <div className="text-sm font-semibold text-gray-900">Documents ({filteredFiles.length})</div>
        {canUpload ? (
          <Button type="button" onClick={() => setUploadOpen(true)}>
            + Upload
          </Button>
        ) : null}
      </div>

      <div className="grid gap-2 rounded border border-gray-200 bg-white p-3 md:grid-cols-5">
        <div className="space-y-1 md:col-span-2">
          <label className="text-xs font-semibold text-gray-600">Category</label>
          <Combobox
            options={(categoriesQuery.data ?? []).map((category) => ({ value: category.id, label: category.label, sublabel: category.code }))}
            value={categoryFilter}
            onChange={(value) => setCategoryFilter(value)}
            loading={categoriesQuery.isLoading}
            allowClear
            placeholder="All categories"
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
        <div className="space-y-1">
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
          <label className="flex items-center gap-2 text-xs text-gray-600 md:col-span-5">
            <input type="checkbox" checked={showDeleted} onChange={(event) => setShowDeleted(event.target.checked)} />
            Show deleted
          </label>
        ) : null}
      </div>

      {documentsError ? <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{documentsError}</div> : null}

      <DataTable
        rows={filteredFiles}
        rowKey={(row) => row.id}
        loading={filesQuery.isLoading}
        columns={[
          {
            key: "original_filename",
            label: "Filename",
            render: (row) => (
              <div className="min-w-[220px]">
                <div className={row.deleted_at ? "text-gray-500 line-through" : "text-gray-900"}>{row.original_filename}</div>
                {row.deleted_at ? <div className="text-[11px] text-red-600">Deleted</div> : null}
              </div>
            ),
          },
          { key: "category_label", label: "Category", render: (row) => row.category_label ?? "-" },
          { key: "document_date", label: "Doc Date", render: (row) => formatDate(row.document_date) },
          { key: "expiration_date", label: "Expires", render: (row) => formatDate(row.expiration_date) },
          { key: "uploader_email", label: "Uploader", render: (row) => row.uploader_email ?? row.uploader_user_id },
          { key: "version_number", label: "Version", render: (row) => `v${row.version_number}` },
          {
            key: "actions",
            label: "Actions",
            className: "w-[270px]",
            render: (row) => (
              <div className="flex flex-wrap gap-1" onClick={(event) => event.stopPropagation()}>
                <Button size="sm" variant="secondary" onClick={() => setSelectedPreviewFile(row)} disabled={!row.upload_completed_at}>
                  Preview
                </Button>
                <Button size="sm" onClick={() => void handleDownload(row)} disabled={!row.upload_completed_at}>
                  Download
                </Button>
                {canEdit ? (
                  <Button size="sm" variant="secondary" onClick={() => setSelectedEditFile(row)}>
                    Edit
                  </Button>
                ) : null}
                {canDelete && !row.deleted_at ? (
                  <Button size="sm" variant="danger" onClick={() => setSelectedDeleteFile(row)}>
                    Soft Delete
                  </Button>
                ) : null}
                {isOwner && row.deleted_at ? (
                  <Button size="sm" variant="secondary" onClick={() => restoreMutation.mutate(row.id)} loading={restoreMutation.isPending}>
                    Restore
                  </Button>
                ) : null}
                <Button size="sm" variant="secondary" onClick={() => setSelectedVersionFile(row)}>
                  Versions
                </Button>
              </div>
            ),
          },
        ]}
      />

      {uploadOpen ? (
        <UploadModal
          entityType={entityType}
          entityId={entityId}
          entityName={entityName}
          onClose={() => setUploadOpen(false)}
          onUploadSuccess={() => {
            setUploadOpen(false);
            void queryClient.invalidateQueries({ queryKey: ["docs-files", entityType, entityId] });
          }}
        />
      ) : null}

      {selectedPreviewFile ? (
        <PreviewModal
          file={selectedPreviewFile}
          canEditMetadata={canEdit}
          onClose={() => setSelectedPreviewFile(null)}
          onRequestEditMetadata={() => {
            setSelectedEditFile(selectedPreviewFile);
            setSelectedPreviewFile(null);
          }}
        />
      ) : null}

      {selectedEditFile ? (
        <EditMetadataModal
          file={selectedEditFile}
          entityType={entityType}
          onClose={() => setSelectedEditFile(null)}
          onSaveSuccess={() => {
            setSelectedEditFile(null);
            void queryClient.invalidateQueries({ queryKey: ["docs-files", entityType, entityId] });
          }}
        />
      ) : null}

      {selectedDeleteFile ? (
        <SoftDeleteModal
          file={selectedDeleteFile}
          onClose={() => setSelectedDeleteFile(null)}
          onDeleteSuccess={() => {
            setSelectedDeleteFile(null);
            void queryClient.invalidateQueries({ queryKey: ["docs-files", entityType, entityId] });
          }}
        />
      ) : null}

      {selectedVersionFile ? (
        <VersionHistoryModal
          rootFileId={selectedVersionFile.id}
          entityType={entityType}
          entityId={entityId}
          entityName={entityName}
          onClose={() => setSelectedVersionFile(null)}
          onVersionUploaded={() => {
            void queryClient.invalidateQueries({ queryKey: ["docs-files", entityType, entityId] });
          }}
        />
      ) : null}
    </div>
  );
}
