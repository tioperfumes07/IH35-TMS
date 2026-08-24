const STALE_CHUNK_RELOAD_KEY = "ih35:stale-chunk-reload-at";
const RELOAD_FUSE_MS = 60_000;

/**
 * Vite emits `vite:preloadError` when an open application shell references a
 * hashed lazy chunk removed by a newer deploy. Recover once by loading the
 * current HTML/manifest, but fuse repeated reloads so a real outage remains
 * visible instead of becoming an infinite refresh loop.
 */
export function installStaleChunkRecovery(): void {
  window.addEventListener("vite:preloadError", (event) => {
    event.preventDefault();

    const lastReloadAt = Number(window.sessionStorage.getItem(STALE_CHUNK_RELOAD_KEY) ?? "0");
    if (Number.isFinite(lastReloadAt) && Date.now() - lastReloadAt < RELOAD_FUSE_MS) {
      return;
    }

    window.sessionStorage.setItem(STALE_CHUNK_RELOAD_KEY, String(Date.now()));
    window.location.reload();
  });
}
