/// <reference lib="webworker" />

declare const self: ServiceWorkerGlobalScope;

const CACHE_NAME = "ih35-driver-shell-v2";
const SHELL_URLS = ["/", "/index.html", "/manifest.json", "/icons/icon-192.png", "/icons/icon-512.png"];

type PushPayload = {
  title?: string;
  body?: string;
  tag?: string;
  data?: Record<string, string>;
};

function parsePushPayload(raw: unknown): PushPayload {
  if (typeof raw === "string") {
    try {
      return parsePushPayload(JSON.parse(raw));
    } catch {
      return { title: "IH35 Driver", body: raw };
    }
  }
  if (raw && typeof raw === "object") {
    const obj = raw as Record<string, unknown>;
    const data =
      obj.data && typeof obj.data === "object" && obj.data !== null
        ? Object.fromEntries(
            Object.entries(obj.data as Record<string, unknown>).map(([k, v]) => [k, String(v ?? "")])
          )
        : undefined;
    return {
      title: typeof obj.title === "string" ? obj.title : "IH35 Driver",
      body: typeof obj.body === "string" ? obj.body : "",
      tag: typeof obj.tag === "string" ? obj.tag : undefined,
      data,
    };
  }
  return { title: "IH35 Driver", body: "" };
}

function resolvePushDeepLink(data?: Record<string, string>): string {
  const kind = String(data?.kind ?? "").trim();
  const loadId = String(data?.load_id ?? "").trim();
  const settlementId = String(data?.settlement_id ?? "").trim();
  const disputeId = String(data?.dispute_id ?? "").trim();

  if (kind === "load_assigned" || kind === "load_reassigned_away") {
    return loadId ? `/loads/${loadId}` : "/today";
  }
  if (kind === "settlement_available") {
    return settlementId ? `/earnings?settlement=${settlementId}` : "/earnings";
  }
  if (kind === "dispute_decided") {
    return disputeId ? `/my-disputes?highlight=${disputeId}` : "/my-disputes";
  }
  if (kind === "hos_warning") return "/hos";
  if (kind === "dispatch_message") return "/messages";
  return "/today";
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_URLS)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);

  if (request.method !== "GET") return;

  if (url.pathname.startsWith("/api/")) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          return response;
        })
        .catch(async () => {
          const cached = await caches.match(request);
          if (cached) return cached;
          return new Response(JSON.stringify({ error: "offline" }), {
            status: 503,
            headers: { "Content-Type": "application/json" },
          });
        })
    );
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put("/index.html", copy));
          return response;
        })
        .catch(async () => (await caches.match("/index.html")) || Response.error())
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((response) => {
        if (response.status === 200) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        }
        return response;
      });
    })
  );
});

self.addEventListener("push", (event) => {
  event.waitUntil(
    (async () => {
      let raw: unknown = null;
      try {
        raw = event.data?.json?.() ?? event.data?.text?.();
      } catch {
        raw = event.data?.text?.();
      }
      const payload = parsePushPayload(raw);
      await self.registration.showNotification(payload.title ?? "IH35 Driver", {
        body: payload.body ?? "",
        tag: payload.tag ?? "ih35-driver",
        data: payload.data ?? {},
        icon: "/icons/icon-192.png",
        badge: "/icons/icon-192.png",
      });
    })()
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const data = event.notification.data as Record<string, string> | undefined;
  const targetPath = resolvePushDeepLink(data);

  event.waitUntil(
    (async () => {
      const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const client of clients) {
        if ("focus" in client) {
          await client.focus();
          client.postMessage({ type: "ih35-push-navigate", path: targetPath });
          return;
        }
      }
      await self.clients.openWindow(targetPath);
    })()
  );
});

self.addEventListener("pushsubscriptionchange", (event) => {
  event.waitUntil(
    (async () => {
      const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const client of clients) {
        client.postMessage({ type: "ih35-push-resubscribe" });
      }
    })()
  );
});
