/**
 * ROUND 8.17 class R — ONE return-context mechanism for every board.
 *
 * Origin (path + search: tab / filters / period / cohort) rides on the detail URL as `ret`.
 * Back restores that exact origin. Board filter/group/period state belongs in the URL, not
 * local-only React state. Cross-module returns are allowed when `ret` is present (operator
 * came from that board intentionally — Cash Flow → Invoice must not collapse to /accounting/invoices).
 */
import { inModuleBackHref } from "./structuralBreadcrumb";

export const RETURN_PARAM = "ret";

/** Full origin href: pathname + search (including leading `?`). */
export function currentOriginHref(pathname: string, search: string): string {
  const q = !search ? "" : search.startsWith("?") ? search : `?${search}`;
  return `${pathname}${q}`;
}

export function encodeReturnContext(originHref: string): string {
  const href = originHref.startsWith("/") ? originHref : `/${originHref}`;
  return encodeURIComponent(href);
}

export function decodeReturnContext(raw: string | null | undefined): string | null {
  if (!raw) return null;
  try {
    const href = decodeURIComponent(String(raw));
    if (!href.startsWith("/") || href.startsWith("//") || href.includes("://")) return null;
    return href;
  } catch {
    return null;
  }
}

/** Attach origin as `ret` on a target href (replaces any existing `ret`). */
export function withReturnContext(targetHref: string, originHref: string): string {
  const hashIdx = targetHref.indexOf("#");
  const hash = hashIdx >= 0 ? targetHref.slice(hashIdx) : "";
  const withoutHash = hashIdx >= 0 ? targetHref.slice(0, hashIdx) : targetHref;
  const qIdx = withoutHash.indexOf("?");
  const path = qIdx >= 0 ? withoutHash.slice(0, qIdx) : withoutHash;
  const params = new URLSearchParams(qIdx >= 0 ? withoutHash.slice(qIdx + 1) : "");
  params.set(RETURN_PARAM, encodeReturnContext(originHref));
  const s = params.toString();
  return `${path}?${s}${hash}`;
}

/**
 * Resolve Back target.
 * 1) `ret` wins (including cross-module).
 * 2) Else structural in-module parent / explicit fallback.
 */
export function resolveBackHref(opts: {
  searchParams: URLSearchParams | string;
  pathname: string;
  fallback?: string | null;
}): string {
  const params =
    typeof opts.searchParams === "string"
      ? new URLSearchParams(opts.searchParams.startsWith("?") ? opts.searchParams.slice(1) : opts.searchParams)
      : opts.searchParams;
  const fromRet = decodeReturnContext(params.get(RETURN_PARAM));
  if (fromRet) return fromRet;
  return inModuleBackHref(opts.pathname, opts.fallback);
}

/** Merge board filter keys into the current search string (URL is source of truth). */
export function mergeUrlBoardState(
  currentSearch: string,
  patch: Record<string, string | null | undefined>,
): string {
  const params = new URLSearchParams(currentSearch.startsWith("?") ? currentSearch.slice(1) : currentSearch);
  for (const [key, value] of Object.entries(patch)) {
    if (value == null || value === "") params.delete(key);
    else params.set(key, value);
  }
  const s = params.toString();
  return s ? `?${s}` : "";
}
