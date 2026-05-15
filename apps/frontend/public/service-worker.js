const OFFLINE_DB = "ih35-driver-offline-v1";
const OFFLINE_STORE = "outbox";

function openOfflineDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(OFFLINE_DB, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(OFFLINE_STORE)) db.createObjectStore(OFFLINE_STORE, { keyPath: "id" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function b64ToBuf(b64) {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i += 1) out[i] = s.charCodeAt(i);
  return out.buffer;
}

async function replayDriverOutboxFromSw() {
  const db = await openOfflineDb();
  const rows = await new Promise((resolve, reject) => {
    const tx = db.transaction(OFFLINE_STORE, "readonly");
    const r = tx.objectStore(OFFLINE_STORE).getAll();
    r.onsuccess = () => resolve(r.result || []);
    r.onerror = () => reject(r.error);
  });
  db.close();
  for (const row of rows) {
    try {
      const headers = Object.fromEntries(row.headers.filter(([k]) => k.toLowerCase() !== "content-length"));
      const res = await fetch(row.url, { method: row.method, headers, body: b64ToBuf(row.bodyB64) });
      if (!res.ok) continue;
      const db2 = await openOfflineDb();
      await new Promise((resolve, reject) => {
        const tx = db2.transaction(OFFLINE_STORE, "readwrite");
        tx.objectStore(OFFLINE_STORE).delete(row.id);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      db2.close();
    } catch {
      /* keep row */
    }
  }
}

self.addEventListener("sync", (event) => {
  if (event.tag === "driver-token-sync") {
    event.waitUntil(Promise.resolve());
    return;
  }
  if (event.tag === "driver-offline-replay") {
    event.waitUntil(replayDriverOutboxFromSw());
  }
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "POST") return;
  const url = new URL(req.url);
  if (!url.pathname.startsWith("/api/v1/driver/")) return;
  event.respondWith(
    (async () => {
      try {
        return await fetch(req);
      } catch {
        const bodyBuf = await req.clone().arrayBuffer();
        const headers = [];
        req.headers.forEach((value, key) => headers.push([key, value]));
        let b64 = "";
        try {
          const bytes = new Uint8Array(bodyBuf);
          let s = "";
          const chunk = 0x8000;
          for (let i = 0; i < bytes.length; i += chunk) s += String.fromCharCode(...bytes.subarray(i, i + chunk));
          b64 = btoa(s);
        } catch {
          b64 = "";
        }
        const row = {
          id: crypto.randomUUID(),
          url: req.url,
          method: req.method,
          headers,
          bodyB64: b64,
          created_at: Date.now(),
        };
        const db = await openOfflineDb();
        await new Promise((resolve, reject) => {
          const tx = db.transaction(OFFLINE_STORE, "readwrite");
          tx.objectStore(OFFLINE_STORE).put(row);
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
        });
        db.close();
        try {
          await self.registration.sync.register("driver-offline-replay");
        } catch {
          /* no sync API */
        }
        return new Response(JSON.stringify({ queued: true }), {
          status: 202,
          headers: { "Content-Type": "application/json" },
        });
      }
    })()
  );
});

self.addEventListener("push", (event) => {
  let data = { title: "IH35 Dispatch", body: "" };
  try {
    const parsed = event.data?.json();
    if (parsed && typeof parsed === "object") data = { ...data, ...parsed };
  } catch {
    try {
      const t = event.data?.text();
      if (t) data.body = t;
    } catch {
      /* ignore */
    }
  }
  event.waitUntil(self.registration.showNotification(data.title, { body: data.body, data: data.data ?? {} }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windowClients) => {
      const url = "/driver/loads";
      for (const client of windowClients) {
        if ("focus" in client) {
          void client.focus();
          return;
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
      return undefined;
    })
  );
});
