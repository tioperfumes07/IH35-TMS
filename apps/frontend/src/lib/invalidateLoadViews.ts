import type { Query, QueryClient } from "@tanstack/react-query";

/**
 * LEAD 443.208R — the ONE frontend refresh for every load + money view (owner 10-21: "if data is updated in one location
 * it is automatically and instantly updated in all locations").
 *
 * Called by (1) the MutationCache for every mutation tagged meta { loads: true } and (2) the realtime bus on every
 * server `load.changed` event (any writer: routes, crons, engines, DB triggers). Prefix / predicate match over every
 * load and money query-key family, so a new key inside a family is covered without editing this list. Only ACTIVE
 * (on-screen) queries refetch; the rest are marked stale — no request burst (GO-LIVE #15).
 */
export const LOAD_VIEW_KEY_FAMILIES: readonly string[] = [
  "loads", "load", "dispatch", "dispatch-board", "dispatch-subnav", "dispatch-alerts", "dispatcher-home",
  "truck-line", "trip-pairing-board", "kanban", "tour-readout", "load-costs", "load-costs-board",
  "load-cost-rollup", "load-cost-rollups", "load-profitability", "load-settlement-summary", "load-stops-record",
  "load-expenses", "ldt-load-documents", "driver-pay-detail", "settlement-for-load", "settlements", "settlements-module",
  "settlements-company-driver", "settlement-disputes", "driver-settlements-summary", "driver-finance", "pre-settlement",
  "pre-settlements", "pre-settlements-open", "driver-profile-loads", "driver-assigned-loads", "driver-load-history",
  "customer-loads", "reports",
];

/** key families matched by prefix (planner, planner-week, driver-hub-*, cash-flow-*). */
export const LOAD_VIEW_KEY_PREFIXES: readonly string[] = ["planner", "driver-hub", "cash-flow", "load-cost", "pre-settlement"];

/** ["accounting", <second>] families that are load / money views. */
export const ACCOUNTING_LOAD_VIEW_KEYS: readonly string[] = ["load-costs-board", "load-costs", "load-profitability", "load-cost-rollup"];

const FAMILY_SET = new Set(LOAD_VIEW_KEY_FAMILIES);

/** Pure: is this query key a load / money view? */
export function isLoadViewQueryKey(key: readonly unknown[]): boolean {
  const first = key[0];
  if (typeof first !== "string") return false;
  if (FAMILY_SET.has(first)) return true;
  if (LOAD_VIEW_KEY_PREFIXES.some((p) => first.startsWith(p))) return true;
  if (first === "accounting" && typeof key[1] === "string") return ACCOUNTING_LOAD_VIEW_KEYS.includes(key[1]);
  return false;
}

export type LoadChangedPayload = { company_id?: string; load_ids?: string[]; tables?: string[] };

export function invalidateLoadViews(qc: QueryClient, _payload?: LoadChangedPayload): Promise<void> {
  return qc.invalidateQueries({ predicate: (q: Query) => isLoadViewQueryKey(q.queryKey) });
}
