/** Remember the last sidebar module the operator clicked so leaf ← returns there. */

export const LAST_MODULE_HREF_KEY = "ih35.lastModuleHref";

export function rememberModuleHref(href: string): void {
  const next = String(href ?? "").trim();
  if (!next) return;
  try {
    window.sessionStorage.setItem(LAST_MODULE_HREF_KEY, next);
  } catch {
    /* private mode */
  }
}

export function lastModuleHref(): string | null {
  try {
    const raw = window.sessionStorage.getItem(LAST_MODULE_HREF_KEY);
    return raw && raw.startsWith("/") ? raw : null;
  } catch {
    return null;
  }
}

/** Use remembered module when we are not already on that module home. */
export function shouldUseLastModuleBack(pathname: string, moduleHref: string | null): boolean {
  if (!moduleHref) return false;
  const path = pathname.split("?")[0];
  if (path === moduleHref) return false;
  return true;
}
