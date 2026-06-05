import { apiRequest } from "../api/client";
import { enqueueUpload, getAllQueueItems, initDB, type UploadQueueItem } from "./upload-queue";

const LAST_ACCESS_KEY = "driver_pwa_last_storage_access_at";
const STALE_MS = 5 * 24 * 60 * 60 * 1000;
const BACKUP_PATH = "/api/v1/driver-pwa/storage-backup";

type QueueBackupRow = Omit<UploadQueueItem, "file_blob"> & { has_blob?: boolean };

type StorageBackupPayload = {
  keys: QueueBackupRow[];
  last_access_at: string;
};

export function isIOSSafari(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  const isIOS = /iphone|ipad|ipod/i.test(ua);
  const isSafari = /safari/i.test(ua) && !/crios|fxios|edgios|chrome/i.test(ua);
  return isIOS && isSafari;
}

function serializeQueueItem(item: UploadQueueItem): QueueBackupRow {
  const { file_blob: _blob, ...rest } = item;
  return { ...rest, has_blob: true };
}

export async function backupQueueToServer(): Promise<void> {
  const items = await getAllQueueItems();
  const keys = items
    .filter((item) => item.status === "pending" || item.status === "uploading" || item.status === "failed")
    .map(serializeQueueItem);
  const payload: StorageBackupPayload = {
    keys,
    last_access_at: new Date().toISOString(),
  };
  try {
    await apiRequest(BACKUP_PATH, { method: "POST", body: payload });
    localStorage.setItem(LAST_ACCESS_KEY, payload.last_access_at);
  } catch (error) {
    console.warn("[itp-storage] server backup failed", error);
  }
}

async function fetchServerBackup(): Promise<StorageBackupPayload | null> {
  try {
    return await apiRequest<StorageBackupPayload>(BACKUP_PATH);
  } catch {
    return null;
  }
}

function queueItemFromBackup(row: QueueBackupRow): UploadQueueItem {
  const placeholderBlob = new Blob([], { type: row.mime_type || "application/octet-stream" });
  return {
    ...row,
    file_blob: placeholderBlob,
    status: row.status === "uploading" ? "failed" : row.status,
    last_error: row.last_error ?? "storage.itp_restore_reupload",
    retry_count: row.retry_count ?? 0,
  };
}

export async function restoreQueueFromServerIfEmpty(): Promise<number> {
  const existing = await getAllQueueItems();
  if (existing.length > 0) return 0;

  const backup = await fetchServerBackup();
  if (!backup?.keys?.length) return 0;

  let restored = 0;
  for (const row of backup.keys) {
    if (row.status === "synced") continue;
    await enqueueUpload(queueItemFromBackup(row));
    restored += 1;
  }
  if (restored > 0) {
    localStorage.setItem(LAST_ACCESS_KEY, new Date().toISOString());
  }
  return restored;
}

export async function isStorageStale(): Promise<boolean> {
  const lastAccess = localStorage.getItem(LAST_ACCESS_KEY);
  if (!lastAccess) return false;
  const age = Date.now() - new Date(lastAccess).getTime();
  return age > STALE_MS;
}

export async function touchStorageAccess() {
  localStorage.setItem(LAST_ACCESS_KEY, new Date().toISOString());
}

export async function bootstrapItpStorage(): Promise<{ restored: number; stale: boolean }> {
  await touchStorageAccess();
  let restored = 0;
  try {
    await initDB();
    restored = await restoreQueueFromServerIfEmpty();
  } catch (error) {
    console.warn("[itp-storage] IndexedDB unavailable, attempting server restore", error);
    restored = await restoreQueueFromServerIfEmpty();
  }

  const stale = await isStorageStale();
  if (isIOSSafari() && (stale || restored > 0)) {
    void backupQueueToServer();
  }
  return { restored, stale };
}

export async function persistQueueWrite() {
  await touchStorageAccess();
  if (isIOSSafari()) {
    void backupQueueToServer();
  }
}
