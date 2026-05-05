import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getDownloadUrl, getFile, type DocsFile, type FileEntityType } from "../../api/docs";
import { ApiError } from "../../api/client";
import { useAuth } from "../../auth/useAuth";
import { Button } from "../Button";
import { Modal } from "../Modal";
import { useToast } from "../Toast";
import { PreviewModal } from "./PreviewModal";
import { UploadModal } from "./UploadModal";

type VersionHistoryModalProps = {
  rootFileId: string;
  entityType: FileEntityType;
  entityId: string;
  entityName: string;
  onClose: () => void;
  onVersionUploaded: () => void;
};

type VersionRow = Pick<
  DocsFile,
  "id" | "version_number" | "original_filename" | "mime_type" | "size_bytes" | "created_at" | "upload_completed_at" | "uploader_email" | "uploader_user_id"
>;

function formatSize(bytes: string) {
  const parsed = Number(bytes || 0);
  if (!Number.isFinite(parsed) || parsed <= 0) return "0 B";
  if (parsed < 1024) return `${parsed} B`;
  if (parsed < 1024 * 1024) return `${(parsed / 1024).toFixed(1)} KB`;
  return `${(parsed / (1024 * 1024)).toFixed(1)} MB`;
}

export function VersionHistoryModal({
  rootFileId,
  entityType,
  entityId,
  entityName,
  onClose,
  onVersionUploaded,
}: VersionHistoryModalProps) {
  const { pushToast } = useToast();
  const { user } = useAuth();
  const [previewFile, setPreviewFile] = useState<DocsFile | null>(null);
  const [uploadVersionOpen, setUploadVersionOpen] = useState(false);

  const canUploadVersion = user?.role === "Owner" || user?.role === "Administrator" || user?.role === "Manager";

  const versionQuery = useQuery({
    queryKey: ["docs-file-versions", rootFileId],
    queryFn: () => getFile(rootFileId),
  });

  const versions = useMemo(() => {
    const payload = versionQuery.data;
    if (!payload) return [] as VersionRow[];
    const fullRows = [payload.file, ...(payload.versions as VersionRow[])];
    const deduped = Array.from(new Map(fullRows.map((row) => [row.id, row])).values());
    return deduped.sort((a, b) => a.version_number - b.version_number);
  }, [versionQuery.data]);

  async function handleDownload(fileId: string) {
    try {
      const response = await getDownloadUrl(fileId);
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
    <>
      <Modal open onClose={onClose} title="Version History">
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="text-sm text-gray-700">
              Linear chain: <strong>v1 → vN</strong>
            </div>
            {canUploadVersion ? (
              <Button type="button" onClick={() => setUploadVersionOpen(true)}>
                Upload New Version
              </Button>
            ) : null}
          </div>

          {versionQuery.isLoading ? <div className="text-sm text-gray-500">Loading versions...</div> : null}
          {versionQuery.isError ? <div className="text-sm text-red-600">Unable to load version history.</div> : null}

          <div className="space-y-2">
            {versions.map((version) => (
              <div key={version.id} className="rounded border border-gray-200 bg-white p-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-sm font-semibold text-gray-900">
                    v{version.version_number} - {version.original_filename}
                  </div>
                  <div className="text-xs text-gray-600">
                    {new Date(version.created_at).toLocaleString()} | {formatSize(version.size_bytes)}
                  </div>
                </div>
                <div className="mt-1 text-xs text-gray-600">Uploader: {version.uploader_email ?? version.uploader_user_id}</div>
                <div className="mt-2 flex gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => setPreviewFile(version as DocsFile)}
                    disabled={!version.upload_completed_at}
                  >
                    Preview
                  </Button>
                  <Button size="sm" onClick={() => void handleDownload(version.id)} disabled={!version.upload_completed_at}>
                    Download
                  </Button>
                </div>
              </div>
            ))}
            {!versionQuery.isLoading && versions.length === 0 ? <div className="text-sm text-gray-500">No versions found.</div> : null}
          </div>
        </div>
      </Modal>

      {previewFile ? (
        <PreviewModal
          file={previewFile}
          canEditMetadata={false}
          onClose={() => setPreviewFile(null)}
          onRequestEditMetadata={() => {
            setPreviewFile(null);
          }}
        />
      ) : null}

      {uploadVersionOpen ? (
        <UploadModal
          entityType={entityType}
          entityId={entityId}
          entityName={entityName}
          parentFileId={rootFileId}
          onClose={() => setUploadVersionOpen(false)}
          onUploadSuccess={() => {
            setUploadVersionOpen(false);
            void versionQuery.refetch();
            onVersionUploaded();
          }}
        />
      ) : null}
    </>
  );
}
