export const STALE_DEPLOY_EVENT = "ih35:stale-deploy";

/**
 * Vite emits `vite:preloadError` when an open application shell references a
 * hashed lazy chunk removed by a newer deploy. WIZ-40: NEVER auto-reload — the
 * owner may be inside Book Load for hours. Notify the banner; it waits until
 * no blocking modal is open, then offers a manual Reload.
 */
export function notifyStaleDeploy(): void {
  window.dispatchEvent(new Event(STALE_DEPLOY_EVENT));
}

export function installStaleChunkRecovery(): void {
  window.addEventListener("vite:preloadError", (event) => {
    event.preventDefault();
    notifyStaleDeploy();
  });
}
