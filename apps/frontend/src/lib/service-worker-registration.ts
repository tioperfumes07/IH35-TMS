import { bumpDriverSessionIfVisible } from "./auth-token";

export function registerDriverServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return Promise.resolve(null);
  return navigator.serviceWorker
    .register("/service-worker.js")
    .then((reg) => {
      const r = reg as ServiceWorkerRegistration & { sync?: { register: (tag: string) => Promise<void> } };
      void r.sync?.register("driver-token-sync");
      return reg;
    })
    .catch(() => null);
}

export function initDriverBackgroundSessionRefresh(): void {
  if (typeof document === "undefined") return;
  document.addEventListener("visibilitychange", () => {
    void bumpDriverSessionIfVisible();
  });
  window.addEventListener("focus", () => {
    void bumpDriverSessionIfVisible();
  });
}
