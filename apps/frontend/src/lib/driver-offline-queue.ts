/**
 * Shared IndexedDB queue for driver POSTs when offline (used by page UI + service worker).
 */

const DB_NAME = "ih35-driver-offline-v1";
const STORE = "outbox";
const DB_VER = 1;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VER);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export type OutboxRow = {
  id: string;
  url: string;
  method: string;
  headers: [string, string][];
  bodyB64: string;
  created_at: number;
};

export async function driverOfflineQueueCount(): Promise<number> {
  const db = await openDb();
  const n = await new Promise<number>((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const r = tx.objectStore(STORE).count();
    r.onsuccess = () => resolve(Number(r.result));
    r.onerror = () => reject(r.error);
  });
  db.close();
  return n;
}

export async function enqueueDriverRequest(request: Request): Promise<void> {
  const bodyBuf = await request.clone().arrayBuffer();
  const headers: [string, string][] = [];
  request.headers.forEach((value, key) => headers.push([key, value]));
  const row: OutboxRow = {
    id: crypto.randomUUID(),
    url: request.url,
    method: request.method,
    headers,
    bodyB64: bufferToB64(bodyBuf),
    created_at: Date.now(),
  };
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(row);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
  try {
    const reg = await navigator.serviceWorker.ready;
    const syncReg = reg as ServiceWorkerRegistration & { sync?: { register: (tag: string) => Promise<void> } };
    await syncReg.sync?.register("driver-offline-replay");
  } catch {
    /* sync unsupported */
  }
}

export async function replayDriverOfflineQueue(): Promise<{ replayed: number; failed: number }> {
  const db = await openDb();
  const rows = await new Promise<OutboxRow[]>((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const r = tx.objectStore(STORE).getAll();
    r.onsuccess = () => resolve((r.result as OutboxRow[]) ?? []);
    r.onerror = () => reject(r.error);
  });
  db.close();

  let replayed = 0;
  let failed = 0;
  for (const row of rows) {
    try {
      const init: RequestInit = {
        method: row.method,
        headers: Object.fromEntries(row.headers.filter(([k]) => k.toLowerCase() !== "content-length")),
        body: b64ToBuffer(row.bodyB64),
      };
      const res = await fetch(row.url, init);
      if (!res.ok) throw new Error(`status_${res.status}`);
      const db2 = await openDb();
      await new Promise<void>((resolve, reject) => {
        const tx = db2.transaction(STORE, "readwrite");
        tx.objectStore(STORE).delete(row.id);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      db2.close();
      replayed += 1;
    } catch {
      failed += 1;
    }
  }
  return { replayed, failed };
}

function bufferToB64(buf: ArrayBuffer): string {
  let s = "";
  const bytes = new Uint8Array(buf);
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) s += String.fromCharCode(...bytes.subarray(i, i + chunk));
  return btoa(s);
}

function b64ToBuffer(b64: string): ArrayBuffer {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i += 1) out[i] = s.charCodeAt(i);
  return out.buffer;
}

export async function driverFetch(input: RequestInfo, init: RequestInit = {}): Promise<Response> {
  const request = new Request(input, init);
  const url = request.url;
  if (request.method === "POST" && url.includes("/api/v1/driver/")) {
    try {
      return await fetch(request);
    } catch {
      await enqueueDriverRequest(request);
      return new Response(JSON.stringify({ queued: true }), {
        status: 202,
        headers: { "Content-Type": "application/json" },
      });
    }
  }
  return fetch(request);
}
