export type UploadQueueStatus = "pending" | "uploading" | "synced" | "failed";

export type UploadQueueItem = {
  id: string;
  file_blob: Blob;
  mime_type: string;
  original_filename: string;
  size_bytes: number;
  category_id: string | null;
  entity_type: "driver" | "load" | "standalone";
  entity_id: string | null;
  document_date: string | null;
  expiration_date: string | null;
  description: string | null;
  retry_count: number;
  last_error: string | null;
  created_at: string;
  status: UploadQueueStatus;
  next_retry_at?: string | null;
  synced_at?: string | null;
};

const DB_NAME = "ih35-driver-pwa";
const DB_VERSION = 1;
const STORE_NAME = "upload_queue";

let dbPromise: Promise<IDBDatabase> | null = null;

function requestToPromise<T>(request: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed"));
  });
}

function txDone(transaction: IDBTransaction) {
  return new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("IndexedDB transaction failed"));
    transaction.onabort = () => reject(transaction.error ?? new Error("IndexedDB transaction aborted"));
  });
}

export async function initDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: "id" });
        store.createIndex("by_status", "status", { unique: false });
        store.createIndex("by_created_at", "created_at", { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Unable to open IndexedDB"));
  });
  return dbPromise;
}

async function withStore<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => Promise<T>) {
  const db = await initDB();
  const transaction = db.transaction(STORE_NAME, mode);
  const store = transaction.objectStore(STORE_NAME);
  const result = await run(store);
  await txDone(transaction);
  return result;
}

export async function enqueueUpload(item: UploadQueueItem) {
  await withStore("readwrite", async (store) => {
    await requestToPromise(store.put(item));
    return true;
  });
  return item.id;
}

export async function getAllQueueItems() {
  const rows = await withStore("readonly", async (store) => requestToPromise(store.getAll() as IDBRequest<UploadQueueItem[]>));
  return rows.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
}

export async function getQueueItem(id: string) {
  return withStore("readonly", async (store) => requestToPromise(store.get(id) as IDBRequest<UploadQueueItem | undefined>));
}

export async function updateQueueItem(id: string, updates: Partial<UploadQueueItem>) {
  return withStore("readwrite", async (store) => {
    const existing = await requestToPromise(store.get(id) as IDBRequest<UploadQueueItem | undefined>);
    if (!existing) return null;
    const merged = { ...existing, ...updates };
    await requestToPromise(store.put(merged));
    return merged;
  });
}

export async function deleteQueueItem(id: string) {
  await withStore("readwrite", async (store) => {
    await requestToPromise(store.delete(id));
    return true;
  });
}

export async function getPendingCount() {
  const rows = await getAllQueueItems();
  return rows.filter((row) => row.status === "pending" || row.status === "uploading").length;
}

export async function getFailedCount() {
  const rows = await getAllQueueItems();
  return rows.filter((row) => row.status === "failed").length;
}
