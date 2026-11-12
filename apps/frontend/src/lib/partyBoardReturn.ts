/**
 * Customers/Vendors approved board chips (?chip=factored / open_bills) must survive Create→Close
 * and detail→Back. EntityLink detail routes do not carry the board query string, so the board
 * remembers its full href here; detail Back reads it (never invents filters).
 */
const KEY = (kind: "customers" | "vendors") => `ih35:party-board-return:${kind}`;

export function rememberPartyBoardReturn(kind: "customers" | "vendors", href: string): void {
  if (typeof sessionStorage === "undefined") return;
  if (!href.startsWith(`/${kind}`)) return;
  sessionStorage.setItem(KEY(kind), href);
}

export function partyBoardReturnHref(kind: "customers" | "vendors", fallback = `/${kind}`): string {
  if (typeof sessionStorage === "undefined") return fallback;
  const stored = sessionStorage.getItem(KEY(kind));
  if (stored && stored.startsWith(`/${kind}`)) return stored;
  return fallback;
}

/** Close Create: drop create (+ legacy view=detail if an old URL still has it); keep chip/range/etc. */
export function clearPartyCreateParams(params: URLSearchParams): URLSearchParams {
  const next = new URLSearchParams(params);
  next.delete("create");
  next.delete("view");
  return next;
}

/**
 * Open Create from the approved board: preserve chip/range.
 * Do NOT stamp view=detail — that forced the legacy Customers/Vendors master-detail page
 * under the drawer (board 9/10 FAIL). Create overlays the Regular board instead.
 */
export function partyCreateParams(params: URLSearchParams): URLSearchParams {
  const next = new URLSearchParams(params);
  next.delete("view");
  next.set("create", "1");
  return next;
}
