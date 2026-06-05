import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { ArrowLeft, RefreshCcw } from "lucide-react";
import { Link } from "react-router-dom";
import { ApiError } from "../api/client";
import { getDownloadUrl, listFiles, type DocsFile } from "../api/docs";
import { getCurrentDriver } from "../api/mdata";
import { ErrorBoundary } from "../components/ErrorBoundary";
import { UploadDocumentModal } from "../components/UploadDocumentModal";
import { Modal } from "../components/Modal";
import { PwaButton } from "../components/PwaButton";
import { useToast } from "../components/Toast";
import { deleteQueueItem, getAllQueueItems, type UploadQueueItem } from "../lib/upload-queue";
import { retryFailedItem, subscribeSyncEvent, syncOnce } from "../lib/upload-sync";

function statusBadge(status: UploadQueueItem["status"], t: (key: string) => string) {
  if (status === "uploading") return t("documents.status_uploading");
  if (status === "failed") return t("documents.status_failed");
  if (status === "synced") return t("documents.status_synced");
  return t("documents.status_queued");
}

function categoryLabel(file: DocsFile | UploadQueueItem, t: (key: string) => string) {
  if ("category_label" in file) return file.category_label ?? t("common.uncategorized");
  return file.category_id ?? t("common.uncategorized");
}

function isImageMime(mimeType: string) {
  return mimeType.startsWith("image/");
}

export function MyDocumentsPage() {
  const { t } = useTranslation();
  const { pushToast } = useToast();
  const [queueRows, setQueueRows] = useState<UploadQueueItem[]>([]);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [previewFile, setPreviewFile] = useState<DocsFile | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string>("");
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [pullStartY, setPullStartY] = useState<number | null>(null);
  const [expandedFailedItemId, setExpandedFailedItemId] = useState<string | null>(null);

  const driverQuery = useQuery({
    queryKey: ["driver-pwa-my-driver-record", "documents-page"],
    queryFn: getCurrentDriver,
  });

  const syncedFilesQuery = useQuery({
    queryKey: ["driver-pwa-synced-files", driverQuery.data?.id],
    queryFn: () =>
      listFiles({
        entity_type: "driver",
        entity_id: driverQuery.data?.id ?? "",
        limit: 100,
        offset: 0,
      }).then((result) => result.files),
    enabled: Boolean(driverQuery.data?.id),
  });

  const pendingRows = useMemo(
    () => queueRows.filter((row) => row.status === "pending" || row.status === "uploading" || row.status === "failed"),
    [queueRows]
  );
  const localSyncedRows = useMemo(() => queueRows.filter((row) => row.status === "synced"), [queueRows]);
  const pendingCount = pendingRows.filter((row) => row.status === "pending" || row.status === "uploading").length;
  const syncedRowsFromApi = syncedFilesQuery.data ?? [];
  const apiSyncedUnavailable = syncedFilesQuery.error instanceof ApiError && syncedFilesQuery.error.status === 403;

  async function loadQueue() {
    const rows = await getAllQueueItems();
    setQueueRows(rows);
  }

  async function refreshAll() {
    await loadQueue();
    await syncedFilesQuery.refetch();
    void syncOnce();
  }

  useEffect(() => {
    void loadQueue();
    const unsubscribeQueue = subscribeSyncEvent("queueChanged", () => {
      void loadQueue();
    });
    const unsubscribeSynced = subscribeSyncEvent("itemSynced", ({ original_filename }) => {
      pushToast(t("documents.synced_toast", { filename: original_filename }), "success");
      void syncedFilesQuery.refetch();
      void loadQueue();
    });
    const unsubscribeFailed = subscribeSyncEvent("itemFailed", ({ original_filename, error }) => {
      pushToast(t("documents.upload_failed_toast", { filename: original_filename, error }), "error");
      void loadQueue();
    });
    return () => {
      unsubscribeQueue();
      unsubscribeSynced();
      unsubscribeFailed();
    };
  }, [pushToast, syncedFilesQuery, t]);

  useEffect(() => {
    if (!previewFile) return;
    let active = true;
    setPreviewUrl("");
    setPreviewError(null);
    void getDownloadUrl(previewFile.id)
      .then((result) => {
        if (!active) return;
        setPreviewUrl(result.presigned_url);
      })
      .catch((error: unknown) => {
        if (!active) return;
        if (error instanceof ApiError && error.status === 503) {
          setPreviewError(t("documents.preview_unavailable_r2"));
        } else {
          setPreviewError(t("documents.preview_unavailable"));
        }
      });
    return () => {
      active = false;
    };
  }, [previewFile, t]);

  return (
    <div
      className="min-h-screen bg-pwa-bg px-4 py-3 text-sm text-pwa-text-primary"
      onTouchStart={(event) => {
        if (window.scrollY > 0) return;
        setPullStartY(event.touches[0]?.clientY ?? null);
      }}
      onTouchEnd={(event) => {
        if (pullStartY === null) return;
        const endY = event.changedTouches[0]?.clientY ?? pullStartY;
        if (endY - pullStartY > 80 && window.scrollY === 0) {
          void refreshAll();
          pushToast(t("documents.refreshing"), "info");
        }
        setPullStartY(null);
      }}
    >
      <div className="mx-auto flex w-full max-w-md flex-col gap-3 pb-20">
        <header className="rounded-xl border border-pwa-border bg-pwa-card p-4">
          <div className="flex items-center justify-between">
            <Link to="/home" className="inline-flex min-h-11 items-center gap-2 text-sm text-pwa-text-secondary">
              <ArrowLeft className="h-4 w-4" />
              {t("common.back")}
            </Link>
            <PwaButton className="min-h-11 px-3" onClick={() => setUploadOpen(true)}>
              {t("documents.upload_cta")}
            </PwaButton>
          </div>
          <h1 className="mt-2 text-lg font-semibold">{t("documents.title")}</h1>
          <button
            type="button"
            className="mt-2 inline-flex items-center gap-2 rounded-lg border border-pwa-border px-2 py-1 text-xs text-pwa-text-secondary"
            onClick={() => void syncOnce()}
          >
            <RefreshCcw className="h-3.5 w-3.5" />
            {t("documents.pending_count", { count: pendingCount })}
          </button>
        </header>

        <section className="rounded-xl border border-pwa-border bg-pwa-card p-3">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="font-semibold">{t("documents.pending_heading")}</h2>
            <PwaButton variant="secondary" className="min-h-9 px-3" onClick={() => void syncOnce()}>
              {t("common.retry_all")}
            </PwaButton>
          </div>
          <div className="space-y-2">
            {pendingRows.map((row) => (
              <div key={row.id} className="rounded-lg border border-pwa-border bg-[#1A2030] p-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate text-sm">{row.original_filename}</div>
                    <div className="text-xs text-pwa-text-secondary">
                      {categoryLabel(row, t)} · {Math.max(1, Math.round(row.size_bytes / 1024))} KB
                    </div>
                  </div>
                  <span className="text-xs text-pwa-text-secondary">{statusBadge(row.status, t)}</span>
                </div>
                {row.status === "failed" ? (
                  <div className="mt-2 space-y-2">
                    <button
                      type="button"
                      className="text-xs text-hos-violation underline"
                      onClick={() => setExpandedFailedItemId((current) => (current === row.id ? null : row.id))}
                    >
                      {expandedFailedItemId === row.id ? t("common.hide_error") : t("common.show_error")}
                    </button>
                    {expandedFailedItemId === row.id ? (
                      <div className="text-xs text-hos-violation">{row.last_error ?? t("common.unknown_error")}</div>
                    ) : null}
                    <div className="flex gap-2">
                      <PwaButton variant="secondary" className="min-h-9 flex-1" onClick={() => void retryFailedItem(row.id)}>
                        {t("common.retry")}
                      </PwaButton>
                      <PwaButton
                        variant="secondary"
                        className="min-h-9 flex-1"
                        onClick={async () => {
                          await deleteQueueItem(row.id);
                          await loadQueue();
                        }}
                      >
                        {t("common.delete")}
                      </PwaButton>
                    </div>
                  </div>
                ) : null}
              </div>
            ))}
            {pendingRows.length === 0 ? <div className="text-xs text-pwa-text-secondary">{t("documents.no_pending")}</div> : null}
          </div>
        </section>

        <section className="rounded-xl border border-pwa-border bg-pwa-card p-3">
          <h2 className="mb-2 font-semibold">{t("documents.synced_heading")}</h2>
          {driverQuery.isLoading ? <div className="mb-2 text-xs text-pwa-text-secondary">{t("documents.loading_profile")}</div> : null}
          {driverQuery.error ? (
            <div className="mb-2 text-xs text-hos-violation">
              {driverQuery.error instanceof ApiError && driverQuery.error.status === 404
                ? t("documents.profile_not_linked")
                : t("documents.profile_load_failed")}
            </div>
          ) : null}
          {apiSyncedUnavailable ? (
            <div className="mb-2 text-xs text-pwa-text-secondary">{t("documents.server_list_unavailable")}</div>
          ) : null}
          <div className="space-y-2">
            {(apiSyncedUnavailable ? [] : syncedRowsFromApi).map((row) => (
              <button
                key={row.id}
                type="button"
                className="w-full rounded-lg border border-pwa-border bg-[#1A2030] p-2 text-left"
                onClick={() => setPreviewFile(row)}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate text-sm">
                      {isImageMime(row.mime_type) ? `${t("documents.img_prefix")} ` : `${t("documents.file_prefix")} `}
                      {row.original_filename}
                    </div>
                    <div className="text-xs text-pwa-text-secondary">
                      {categoryLabel(row, t)} · {new Date(row.created_at).toLocaleString()}
                    </div>
                  </div>
                  <span className="text-xs text-pwa-text-secondary">{t("documents.tap_to_preview")}</span>
                </div>
              </button>
            ))}

            {apiSyncedUnavailable
              ? localSyncedRows.map((row) => (
                  <div key={row.id} className="rounded-lg border border-pwa-border bg-[#1A2030] p-2">
                    <div className="text-sm">{row.original_filename}</div>
                    <div className="text-xs text-pwa-text-secondary">
                      {categoryLabel(row, t)} · {row.synced_at ? new Date(row.synced_at).toLocaleString() : t("documents.synced_label")}
                    </div>
                  </div>
                ))
              : null}

            {!apiSyncedUnavailable && syncedRowsFromApi.length === 0 ? (
              <div className="text-xs text-pwa-text-secondary">{t("documents.no_synced")}</div>
            ) : null}
            {apiSyncedUnavailable && localSyncedRows.length === 0 ? (
              <div className="text-xs text-pwa-text-secondary">{t("documents.no_local_synced")}</div>
            ) : null}
          </div>
        </section>
      </div>

      <ErrorBoundary>
        <UploadDocumentModal
          open={uploadOpen}
          onClose={() => setUploadOpen(false)}
          onQueued={() => {
            void loadQueue();
            void syncOnce();
          }}
        />
      </ErrorBoundary>

      <Modal
        open={Boolean(previewFile)}
        onClose={() => {
          setPreviewFile(null);
          setPreviewUrl("");
          setPreviewError(null);
        }}
        title={previewFile ? t("documents.preview_title", { filename: previewFile.original_filename }) : t("common.preview")}
      >
        {previewError ? <div className="text-sm text-hos-violation">{previewError}</div> : null}
        {!previewError && !previewUrl ? <div className="text-sm text-pwa-text-secondary">{t("documents.loading_preview")}</div> : null}
        {!previewError && previewUrl && previewFile && isImageMime(previewFile.mime_type) ? (
          <img src={previewUrl} alt={previewFile.original_filename} className="max-h-[60vh] w-full rounded object-contain" />
        ) : null}
        {!previewError && previewUrl && previewFile && previewFile.mime_type === "application/pdf" ? (
          <object data={previewUrl} type="application/pdf" className="h-[60vh] w-full rounded" />
        ) : null}
        {!previewError && previewUrl && previewFile && !isImageMime(previewFile.mime_type) && previewFile.mime_type !== "application/pdf" ? (
          <div className="space-y-2">
            <p className="text-sm text-pwa-text-secondary">{t("documents.preview_not_available_type")}</p>
            <a href={previewUrl} target="_blank" rel="noreferrer">
              <PwaButton className="w-full">{t("common.download_to_view")}</PwaButton>
            </a>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
