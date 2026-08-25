/**
 * UI-BACK-BUTTON-IGNORES-REAL-NAVIGATION-HISTORY: owner report (2026-08-25) -- "make sure that
 * those that have [a back button] take you back to the correct module, the one you went from."
 * Both PageHeader components previously preferred a static `backHref` prop over the browser's own
 * navigation history whenever `backHref` was set (79 pages across the app pass one) -- so a page
 * reachable from multiple places (e.g. an invoice detail opened from /accounting/invoices, from a
 * customer profile, or from a Program Tracker deep link) always sent the user to the SAME hardcoded
 * parent regardless of where they actually came from, which is exactly "not the correct module."
 *
 * `navigate(-1)` (true history-based back) is the only thing that can honestly satisfy "the one you
 * went from" -- but it must not fire on a direct URL load/refresh, where there is no real in-app
 * page to go back to (it would leave the SPA entirely). `window.history.state.idx` is the React
 * Router / @remix-run/router history stack position: 0 on the very first entry (direct load,
 * empirically confirmed live: a fresh full navigation to a URL produces `{ idx: 0 }`), incrementing
 * with every subsequent in-app navigation (also empirically confirmed live: one client-side
 * navigation produced `{ idx: 1, key, usr }`). `idx > 0` is therefore a precise, verified signal
 * that a real "back" target exists in this browsing session.
 */
export function hasInAppHistory(historyState: unknown): boolean {
  const idx = (historyState as { idx?: unknown } | null | undefined)?.idx;
  return typeof idx === "number" && idx > 0;
}
