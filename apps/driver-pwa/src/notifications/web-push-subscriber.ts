import { apiRequest } from "../api/client";
import { installPushNavigationListener } from "./notification-handler.js";

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i += 1) outputArray[i] = rawData.charCodeAt(i);
  return outputArray;
}

function arrayBufferToBase64Url(buf: ArrayBuffer | null): string {
  if (!buf) return "";
  const bytes = new Uint8Array(buf);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i += 1) binary += String.fromCharCode(bytes[i]);
  return window.btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function readVapidPublicKeyFromEnv(): string {
  return String(
    (import.meta as unknown as { env?: { VITE_VAPID_PUBLIC_KEY?: string } }).env?.VITE_VAPID_PUBLIC_KEY ?? ""
  ).trim();
}

export async function registerDriverPwaWebPush(vapidPublicKeyB64: string): Promise<{ ok: boolean; reason?: string }> {
  if (!vapidPublicKeyB64) return { ok: false, reason: "missing_vapid_key" };
  if (!("Notification" in window) || !("serviceWorker" in navigator)) {
    return { ok: false, reason: "notifications_unsupported" };
  }

  const perm = await Notification.requestPermission();
  if (perm !== "granted") return { ok: false, reason: "permission_denied" };

  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(vapidPublicKeyB64) as unknown as BufferSource,
  });

  const json = sub.toJSON();
  await apiRequest<void>("/api/v1/driver/push-subscription", {
    method: "POST",
    body: {
      endpoint: json.endpoint ?? sub.endpoint,
      keys: {
        p256dh: arrayBufferToBase64Url(sub.getKey("p256dh")),
        auth: arrayBufferToBase64Url(sub.getKey("auth")),
      },
    },
  });

  return { ok: true };
}

let bootstrapStarted = false;

async function tryAutoSubscribe(): Promise<void> {
  const vapid = readVapidPublicKeyFromEnv();
  if (!vapid) return;

  try {
    await apiRequest<{ id?: string }>("/api/v1/auth/me");
  } catch {
    return;
  }

  if (!("serviceWorker" in navigator)) return;
  const reg = await navigator.serviceWorker.ready;
  const existing = await reg.pushManager.getSubscription();
  if (existing) return;

  if (Notification.permission === "default") {
    // defer until user interacts — Home/settings can call registerDriverPwaWebPush explicitly
    return;
  }
  if (Notification.permission !== "granted") return;

  await registerDriverPwaWebPush(vapid).catch(() => undefined);
}

export function installWebPushAutoSubscribe(): void {
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

installWebPushAutoSubscribe();

if (typeof window !== "undefined") {
  installPushNavigationListener((path) => {
    if (window.location.pathname + window.location.search !== path) {
      window.location.assign(path);
    }
  });
}
