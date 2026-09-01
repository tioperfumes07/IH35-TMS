import { z } from "zod";

// COL-01-ALERT-BOARDS-LOCATION-SORT — "location" added: a plain single DB column (delivery_city /
// next_stop_city / stop_city per board, all real `ls.city`-shaped joins) that had no sort key at
// all, so its column header rendered with no sort control on all 3 alert boards. Every OTHER
// unsortable column on these boards (billable_minutes, live_accrued_amount_cents,
// operational_state, billing_state, risk_state, eta_signal) is computed in JS AFTER the SQL query
// runs (see detention.service.ts's accrual calc) -- there is no column to ORDER BY for those
// without restructuring the accrual computation into SQL, a larger, financial-adjacent change
// intentionally left out of this mechanical fix (flagged, not silently skipped).
export const dispatchAlertQueryFields = {
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  sort: z.enum(["event_at", "load_number", "customer_name", "driver_name", "unit_number", "status", "location"]).default("event_at"),
  direction: z.enum(["asc", "desc"]).default("asc"),
};

export type DispatchAlertQuery = {
  from?: string;
  to?: string;
  sort: "event_at" | "load_number" | "customer_name" | "driver_name" | "unit_number" | "status" | "location";
  direction: "asc" | "desc";
};

export function dispatchAlertDateRangeIsValid(query: { from?: string; to?: string }): boolean {
  return !(query.from && query.to && query.from > query.to);
}

// The `sort` enum is shared across all 3 alert-board routes, but each route only maps a subset of
// keys to a real column on ITS OWN query (e.g. "location" is real on all 3, but a route that never
// wires "status" would have no entry for it). A request could otherwise combine a globally-valid
// enum value with a route whose `columns` map doesn't define it, producing literal `undefined ASC`
// as SQL -- COL-01-ALERT-BOARDS-LOCATION-SORT's own case would have hit exactly this the moment
// "location" became a shared enum value. Falling back to the route's own default (event_at) column
// keeps every route safe regardless of which keys it individually supports.
export function dispatchAlertOrderBy(
  query: DispatchAlertQuery,
  columns: Partial<Record<DispatchAlertQuery["sort"], string>> & { event_at: string },
): string {
  const column = columns[query.sort] ?? columns.event_at;
  const direction = query.direction === "desc" ? "DESC" : "ASC";
  return `${column} ${direction} NULLS LAST`;
}
