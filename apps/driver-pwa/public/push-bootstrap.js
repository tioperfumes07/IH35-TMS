var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);

// apps/driver-pwa/src/api/client.ts
function buildUrl(path) {
  if (!API_BASE_URL) return path;
  return `${API_BASE_URL.replace(/\/$/, "")}${path}`;
}
async function apiRequest(path, options = {}) {
  const headers = {};
  if (options.body !== void 0) {
    headers["Content-Type"] = "application/json";
  }
  const response = await fetch(buildUrl(path), {
    method: options.method ?? "GET",
    credentials: "include",
    headers,
    body: options.body === void 0 ? void 0 : JSON.stringify(options.body),
    signal: options.signal
  });
  const isJson = response.headers.get("content-type")?.includes("application/json");
  const payload = isJson ? await response.json() : await response.text();
  if (response.status === 401) {
    if (window.location.pathname !== "/login") {
      window.location.href = "/login?reason=session_expired";
    }
    throw new ApiError(response.status, payload);
  }
  if (response.status === 403) {
    const errorCode = typeof payload === "object" && payload !== null ? payload.error : void 0;
    if (errorCode === "drivers_only" || errorCode === "driver_profile_not_found") {
      const onDriversOnlyPage = window.location.pathname === "/login" && new URLSearchParams(window.location.search).get("reason") === "drivers_only";
      if (!onDriversOnlyPage) {
        window.location.href = "/login?reason=drivers_only";
      }
      throw new ApiError(response.status, payload);
    }
  }
  if (!response.ok) {
    throw new ApiError(response.status, payload);
  }
  return payload;
}
var ApiError, API_BASE_URL;
var init_client = __esm({
  "apps/driver-pwa/src/api/client.ts"() {
    ApiError = class extends Error {
      constructor(status, data) {
        super(`API request failed with status ${status}`);
        __publicField(this, "status");
        __publicField(this, "data");
        this.status = status;
        this.data = data;
      }
    };
    API_BASE_URL = import.meta.env.VITE_API_BASE_URL?.trim();
  }
});

// apps/driver-pwa/src/notifications/notification-handler.ts
function installPushNavigationListener(onNavigate) {
  if (typeof navigator === "undefined" || !navigator.serviceWorker) return;
  navigator.serviceWorker.addEventListener("message", (event) => {
    const data = event.data;
    if (data?.type === "ih35-push-navigate" && typeof data.path === "string") {
      onNavigate(data.path);
    }
    if (data?.type === "ih35-push-resubscribe") {
      void Promise.resolve().then(() => (init_web_push_subscriber(), web_push_subscriber_exports)).then((m) => {
        const vapid = m.readVapidPublicKeyFromEnv();
        if (vapid) void m.registerDriverPwaWebPush(vapid);
      });
    }
  });
}
var init_notification_handler = __esm({
  "apps/driver-pwa/src/notifications/notification-handler.ts"() {
  }
});

// apps/driver-pwa/src/notifications/web-push-subscriber.ts
var web_push_subscriber_exports = {};
__export(web_push_subscriber_exports, {
  installWebPushAutoSubscribe: () => installWebPushAutoSubscribe,
  readVapidPublicKeyFromEnv: () => readVapidPublicKeyFromEnv,
  registerDriverPwaWebPush: () => registerDriverPwaWebPush
});
function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i += 1) outputArray[i] = rawData.charCodeAt(i);
  return outputArray;
}
function arrayBufferToBase64Url(buf) {
  if (!buf) return "";
  const bytes = new Uint8Array(buf);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i += 1) binary += String.fromCharCode(bytes[i]);
  return window.btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function readVapidPublicKeyFromEnv() {
  return String(
    import.meta.env?.VITE_VAPID_PUBLIC_KEY ?? ""
  ).trim();
}
async function registerDriverPwaWebPush(vapidPublicKeyB64) {
  if (!vapidPublicKeyB64) return { ok: false, reason: "missing_vapid_key" };
  if (!("Notification" in window) || !("serviceWorker" in navigator)) {
    return { ok: false, reason: "notifications_unsupported" };
  }
  const perm = await Notification.requestPermission();
  if (perm !== "granted") return { ok: false, reason: "permission_denied" };
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(vapidPublicKeyB64)
  });
  const json = sub.toJSON();
  await apiRequest("/api/v1/driver/push-subscription", {
    method: "POST",
    body: {
      endpoint: json.endpoint ?? sub.endpoint,
      keys: {
        p256dh: arrayBufferToBase64Url(sub.getKey("p256dh")),
        auth: arrayBufferToBase64Url(sub.getKey("auth"))
      }
    }
  });
  return { ok: true };
}
async function tryAutoSubscribe() {
  const vapid = readVapidPublicKeyFromEnv();
  if (!vapid) return;
  try {
    await apiRequest("/api/v1/auth/me");
  } catch {
    return;
  }
  if (!("serviceWorker" in navigator)) return;
  const reg = await navigator.serviceWorker.ready;
  const existing = await reg.pushManager.getSubscription();
  if (existing) return;
  if (Notification.permission === "default") {
    return;
  }
  if (Notification.permission !== "granted") return;
  await registerDriverPwaWebPush(vapid).catch(() => void 0);
}
function installWebPushAutoSubscribe() {
  if (bootstrapStarted || typeof window === "undefined") return;
  bootstrapStarted = true;
  void tryAutoSubscribe();
  navigator.serviceWorker?.addEventListener?.("controllerchange", () => {
    void tryAutoSubscribe();
  });
  window.addEventListener("focus", () => {
    void tryAutoSubscribe();
  });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") void tryAutoSubscribe();
  });
}
var bootstrapStarted;
var init_web_push_subscriber = __esm({
  "apps/driver-pwa/src/notifications/web-push-subscriber.ts"() {
    init_client();
    init_notification_handler();
    bootstrapStarted = false;
    installWebPushAutoSubscribe();
    if (typeof window !== "undefined") {
      installPushNavigationListener((path) => {
        if (window.location.pathname + window.location.search !== path) {
          window.location.assign(path);
        }
      });
    }
  }
});
init_web_push_subscriber();
export {
  installWebPushAutoSubscribe,
  readVapidPublicKeyFromEnv,
  registerDriverPwaWebPush
};
