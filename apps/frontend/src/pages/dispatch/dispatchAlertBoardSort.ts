import type { DispatchAlertQuery } from "../../api/dispatch";

/** ParityTable column keys computed after fetch — client sort only (full population, no SQL column). */
export const DISPATCH_ALERT_CLIENT_SORT_KEYS = new Set([
  "risk_state",
  "eta_signal",
  "billable_minutes",
  "live_accrued_amount_cents",
  "operational_state",
  "billing_state",
]);

export function isDispatchAlertClientSortKey(key: string): boolean {
  return DISPATCH_ALERT_CLIENT_SORT_KEYS.has(key);
}

function riskStateValue(row: Record<string, unknown>): string {
  const parts: string[] = [];
  if (row.is_at_risk) parts.push("at_risk");
  if (row.is_late) parts.push("late");
  return parts.join("+");
}

function etaSignalValue(row: Record<string, unknown>): string {
  const pred = row.latest_eta_prediction as Record<string, unknown> | null | undefined;
  if (!pred) return "";
  const cls = String(pred.confidence_class ?? "");
  const variance = pred.variance_minutes != null ? String(pred.variance_minutes).padStart(8, "0") : "";
  const at = pred.predicted_arrival_at ? String(pred.predicted_arrival_at) : "";
  return `${cls}\t${variance}\t${at}`;
}

function comparePrimitive(a: unknown, b: unknown): number {
  const left = a == null || a === "" ? null : a;
  const right = b == null || b === "" ? null : b;
  if (left == null && right == null) return 0;
  if (left == null) return 1;
  if (right == null) return -1;
  if (typeof left === "number" && typeof right === "number") return left - right;
  return String(left).localeCompare(String(right), undefined, { numeric: true, sensitivity: "base" });
}

export function compareDispatchAlertBoardRow(
  a: Record<string, unknown>,
  b: Record<string, unknown>,
  sortKey: string,
): number {
  switch (sortKey) {
    case "risk_state":
      return comparePrimitive(riskStateValue(a), riskStateValue(b));
    case "eta_signal":
      return comparePrimitive(etaSignalValue(a), etaSignalValue(b));
    case "billable_minutes":
      return comparePrimitive(a.billable_minutes, b.billable_minutes);
    case "live_accrued_amount_cents":
      return comparePrimitive(
        a.live_accrued_amount_cents ?? a.accrued_amount_cents,
        b.live_accrued_amount_cents ?? b.accrued_amount_cents,
      );
    case "operational_state":
      return comparePrimitive(a.operational_state, b.operational_state);
    case "billing_state":
      return comparePrimitive(a.billing_state, b.billing_state);
    default:
      return 0;
  }
}

export function sortDispatchAlertBoardRows<T extends Record<string, unknown>>(
  rows: T[],
  sortKey: string,
  direction: "asc" | "desc",
): T[] {
  if (!isDispatchAlertClientSortKey(sortKey)) return rows;
  const copy = [...rows];
  copy.sort((a, b) => {
    const cmp = compareDispatchAlertBoardRow(a, b, sortKey);
    return direction === "desc" ? -cmp : cmp;
  });
  return copy;
}

/** Map ParityTable column key → shared dispatch alert API sort param (server ORDER BY). */
export function paritySortKeyToDispatchAlertQuery(
  key: string,
): NonNullable<DispatchAlertQuery["sort"]> {
  if (key === "next_stop_scheduled_at" || key === "started_at") return "event_at";
  if (key === "delivery_city" || key === "next_stop_city" || key === "stop_city") return "location";
  if (
    key === "load_number" ||
    key === "customer_name" ||
    key === "driver_name" ||
    key === "unit_number" ||
    key === "status" ||
    key === "location" ||
    key === "event_at"
  ) {
    return key as NonNullable<DispatchAlertQuery["sort"]>;
  }
  return "event_at";
}

export function serverDispatchAlertQueryFromSortState(
  paritySortKey: string,
  direction: "asc" | "desc",
): Pick<DispatchAlertQuery, "sort" | "direction"> {
  if (isDispatchAlertClientSortKey(paritySortKey)) {
    return { sort: "event_at", direction: "asc" };
  }
  return { sort: paritySortKeyToDispatchAlertQuery(paritySortKey), direction };
}
