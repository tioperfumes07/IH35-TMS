import { confirmUpload, normalizeUploadError, requestUploadUrl, updateFileMetadata, uploadBlobToR2 } from "../api/docs";
import { deleteQueueItem, getAllQueueItems, getPendingCount, initDB, updateQueueItem, type UploadQueueItem } from "./upload-queue";

const RETRY_BACKOFF_MS = [5000, 30000, 120000, 600000, 1800000];
const SYNC_INTERVAL_MS = 5 * 60 * 1000;
const MAX_RETRIES = 5;
const SYNCED_RETENTION_MS = 24 * 60 * 60 * 1000;

type SyncEventMap = {
  syncStarted: { total: number };
  syncProgress: { current: number; total: number };
  itemSynced: { id: string; original_filename: string };
  itemFailed: { id: string; original_filename: string; error: string };
  syncComplete: { synced: number; failed: number };
  queueChanged: { pendingCount: number };
};

type SyncState = {
  onlineStatus: "online" | "connecting" | "offline";
  pendingCount: number;
  isSyncing: boolean;
};

const eventTarget = new EventTarget();
const stateListeners = new Set<(state: SyncState) => void>();

let intervalId: number | null = null;
let serviceStarted = false;
let runningSyncPromise: Promise<void> | null = null;
let syncState: SyncState = {
  onlineStatus: navigator.onLine ? "connecting" : "offline",
  pendingCount: 0,
  isSyncing: false,
};

function emitState(next: Partial<SyncState>) {
  syncState = { ...syncState, ...next };
  for (const listener of stateListeners) listener(syncState);
}

function emitEvent<K extends keyof SyncEventMap>(type: K, detail: SyncEventMap[K]) {
  eventTarget.dispatchEvent(new CustomEvent(type, { detail }));
}

async function refreshPendingCount() {
  const pendingCount = await getPendingCount();
  emitState({ pendingCount });
  emitEvent("queueChanged", { pendingCount });
}

function computeNextRetryAt(retryCount: number) {
  const idx = Math.min(Math.max(retryCount - 1, 0), RETRY_BACKOFF_MS.length - 1);
  const waitMs = RETRY_BACKOFF_MS[idx] ?? RETRY_BACKOFF_MS[RETRY_BACKOFF_MS.length - 1];
  return new Date(Date.now() + waitMs).toISOString();
}

async function cleanupSyncedItems() {
  const rows = await getAllQueueItems();
  const now = Date.now();
  const toDelete = rows.filter((row) => row.status === "synced" && row.synced_at && now - new Date(row.synced_at).getTime() > SYNCED_RETENTION_MS);
  await Promise.all(toDelete.map((row) => deleteQueueItem(row.id)));
}

async function shouldProcessItem(item: UploadQueueItem) {
  if (item.status === "synced") return false;
  if (item.status === "uploading") {
    await updateQueueItem(item.id, { status: "pending" });
    return true;
  }
  if (item.retry_count >= MAX_RETRIES) return false;
  if (item.next_retry_at && new Date(item.next_retry_at).getTime() > Date.now()) return false;
  return item.status === "pending" || item.status === "failed";
}

async function processQueueItem(item: UploadQueueItem) {
  if (item.entity_type === "driver" && !item.entity_id) {
    await updateQueueItem(item.id, {
      status: "failed",
      retry_count: MAX_RETRIES,
      last_error: "Missing driver entity id",
      next_retry_at: null,
    });
    emitEvent("itemFailed", { id: item.id, original_filename: item.original_filename, error: "Missing driver entity id" });
    return false;
  }

  await updateQueueItem(item.id, { status: "uploading", last_error: null });
  await refreshPendingCount();

  try {
    const uploadInit = await requestUploadUrl({
      original_filename: item.original_filename,
      mime_type: item.mime_type || "application/octet-stream",
      size_bytes: item.size_bytes,
      category_id: item.category_id ?? undefined,
      entity_links:
        item.entity_type === "standalone"
          ? undefined
          : [
              {
                entity_type: item.entity_type === "load" ? "load" : "driver",
                entity_id: item.entity_id as string,
              },
            ],
    });

    await uploadBlobToR2(uploadInit.presigned_url, item.file_blob, item.mime_type || "application/octet-stream", 60000);
    await confirmUpload(uploadInit.file_id);
    await updateFileMetadata(uploadInit.file_id, {
      category_id: item.category_id,
      document_date: item.document_date,
      expiration_date: item.expiration_date,
      description: item.description,
    });

    await updateQueueItem(item.id, {
      status: "synced",
      synced_at: new Date().toISOString(),
      last_error: null,
      next_retry_at: null,
    });
    emitEvent("itemSynced", { id: item.id, original_filename: item.original_filename });
    return true;
  } catch (error) {
    const normalizedError = normalizeUploadError(error);
    const retryCount = item.retry_count + 1;
    const exhausted = retryCount >= MAX_RETRIES;
    await updateQueueItem(item.id, {
      status: exhausted ? "failed" : "pending",
      retry_count: retryCount,
      last_error: normalizedError,
      next_retry_at: exhausted ? null : computeNextRetryAt(retryCount),
    });
    emitEvent("itemFailed", { id: item.id, original_filename: item.original_filename, error: normalizedError });
    return false;
  } finally {
    await refreshPendingCount();
  }
}

function getApiBaseUrl() {
  return (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, "") ?? "";
}

export async function isOnline() {
  if (!navigator.onLine) {
    emitState({ onlineStatus: "offline" });
    return false;
  }
  emitState({ onlineStatus: "connecting" });
  try {
    const response = await fetch(`${getApiBaseUrl()}/api/v1/_healthcheck`, {
      method: "GET",
      credentials: "include",
      cache: "no-store",
    });
    const healthy = response.ok;
    emitState({ onlineStatus: healthy ? "online" : "offline" });
    return healthy;
  } catch {
    emitState({ onlineStatus: "offline" });
    return false;
  }
}

export async function syncOnce() {
  if (runningSyncPromise) return runningSyncPromise;
  runningSyncPromise = (async () => {
    emitState({ isSyncing: true });
    await cleanupSyncedItems();
    await refreshPendingCount();

    const online = await isOnline();
    if (!online) {
      emitState({ isSyncing: false });
      return;
    }

    const allItems = await getAllQueueItems();
    const items = [];
    for (const item of allItems) {
      if (await shouldProcessItem(item)) items.push(item);
    }
    emitEvent("syncStarted", { total: items.length });

    let synced = 0;
    let failed = 0;
    for (let index = 0; index < items.length; index += 1) {
      const item = items[index];
      const ok = await processQueueItem(item);
      if (ok) synced += 1;
      else failed += 1;
      emitEvent("syncProgress", { current: index + 1, total: items.length });
    }

    emitEvent("syncComplete", { synced, failed });
    await refreshPendingCount();
    emitState({ isSyncing: false });
  })()
    .catch(() => {
      emitState({ isSyncing: false });
    })
    .finally(() => {
      runningSyncPromise = null;
    });
  return runningSyncPromise;
}

export function startSyncService() {
  if (serviceStarted) return;
  serviceStarted = true;

  void initDB().then(() => {
    void refreshPendingCount();
    void syncOnce();
  });

  const onOnline = () => {
    void syncOnce();
  };
  window.addEventListener("online", onOnline);

  intervalId = window.setInterval(() => {
    void syncOnce();
  }, SYNC_INTERVAL_MS);

  const stop = () => {
    window.removeEventListener("online", onOnline);
  };
  (startSyncService as unknown as { __cleanup?: () => void }).__cleanup = stop;
}

export function stopSyncService() {
  if (!serviceStarted) return;
  serviceStarted = false;
  if (intervalId !== null) {
    window.clearInterval(intervalId);
    intervalId = null;
  }
  const cleanup = (startSyncService as unknown as { __cleanup?: () => void }).__cleanup;
  cleanup?.();
}

export function subscribeSyncEvent<K extends keyof SyncEventMap>(type: K, listener: (detail: SyncEventMap[K]) => void) {
  const wrapped = (event: Event) => {
    listener((event as CustomEvent<SyncEventMap[K]>).detail);
  };
  eventTarget.addEventListener(type, wrapped);
  return () => eventTarget.removeEventListener(type, wrapped);
}

export function subscribeSyncState(listener: (state: SyncState) => void) {
  stateListeners.add(listener);
  listener(syncState);
  return () => {
    stateListeners.delete(listener);
  };
}

export async function retryFailedItem(id: string) {
  await updateQueueItem(id, {
    status: "pending",
    next_retry_at: null,
    last_error: null,
    retry_count: 0,
  });
  await refreshPendingCount();
  await syncOnce();
}
