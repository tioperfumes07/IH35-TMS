import { driverApiRequest } from "../api/driver-client";

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

export async function registerDriverWebPush(vapidPublicKeyB64: string): Promise<{ ok: boolean; reason?: string }> {
  if (!vapidPublicKeyB64) return { ok: false, reason: "missing_vapid_key" };
  if (!("Notification" in window)) return { ok: false, reason: "notifications_unsupported" };
  const perm = await Notification.requestPermission();
  if (perm !== "granted") return { ok: false, reason: "permission_denied" };

  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(vapidPublicKeyB64) as unknown as BufferSource,
  });
  const json = sub.toJSON();
  const key = sub.getKey("p256dh");
  const auth = sub.getKey("auth");
  await driverApiRequest(`/api/v1/driver/push-subscription`, {
    method: "POST",
    body: {
      endpoint: json.endpoint ?? sub.endpoint,
      keys: {
        p256dh: arrayBufferToBase64Url(key),
        auth: arrayBufferToBase64Url(auth),
      },
    },
  });
  return { ok: true };
}

export function readVapidPublicKeyFromEnv(): string {
  return String((import.meta as unknown as { env?: { VITE_VAPID_PUBLIC_KEY?: string } }).env?.VITE_VAPID_PUBLIC_KEY ?? "").trim();
}
