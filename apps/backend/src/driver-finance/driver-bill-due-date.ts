import { pgDateOnly } from "../lib/pg-date-only.js";
/**
 * Rows 94 + 124(a) (ACCT-F11065) — THE due date of a driver A/P bill.
 *
 * Owner rule (2026-10-22): "all driver bills due date is the date of the load delivery". The code already carries that
 * rule in ONE place — driver_finance.load_driver_pay_due(load_id): the final active delivery stop's actual departure
 * (basis 'delivered'), else its appointment/schedule (basis 'projected'), in America/Chicago. The delivery-accrual
 * writer (driver-pay-delivery-accrual.service.ts) already stamps bill_date = due_date = that date.
 *
 * Root cause this closes: the settlement close writer (settlement-ap-chain.service.ts postLoadBill) created every
 * per-load and salary A/P bill with NO dueDate, so accounting.bills.due_date was NULL (prod 11-03: 11 USMCA
 * settlement_driver_bill rows, 6 live — 13546, 13562, 13687, 13691, 13696, 13697; 13530 / P-0069 was hand-stamped
 * 10-23). This resolver is what that writer now calls; createBillInClientTx refuses a driver bill without one.
 *
 * Fallback (no delivery stop at all): the bill date — the same COALESCE(due_date, bill_date) the A/P aging already
 * applies (BILL_AGING_DUE_DATE_SQL), now stored instead of implied. Never a made-up term.
 */
type Q = { query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[] }> };

export const DRIVER_BILL_SOURCES_REQUIRING_DUE_DATE = ["settlement_driver_bill", "driver_pay_accrual"] as const;

export type DriverBillDueDate = { dueDate: string; basis: "delivered" | "projected" | "bill_date" };

/** Pure: pick the due date from the load's delivery evidence, else the bill date. */
export function pickDriverBillDueDate(loadDue: { due_date: string | null; basis: string | null } | null | undefined, billDate: string): DriverBillDueDate {
  const d = pgDateOnly(loadDue?.due_date);
  if (d && /^\d{4}-\d{2}-\d{2}$/.test(d)) {
    return { dueDate: d, basis: loadDue?.basis === "delivered" ? "delivered" : "projected" };
  }
  const b = String(billDate ?? "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(b)) throw new Error("driver_bill_due_date_unresolvable");
  return { dueDate: b, basis: "bill_date" };
}

/** The due date of a driver bill for a load, from driver_finance.load_driver_pay_due (the one rule). */
export async function resolveDriverBillDueDate(client: Q, loadId: string, billDate: string): Promise<DriverBillDueDate> {
  const row = (await client.query<{ due_date: string | null; basis: string | null }>(
    `SELECT d.due_date::text, d.basis FROM driver_finance.load_driver_pay_due($1::uuid) d`,
    [loadId]
  )).rows[0] ?? null;
  return pickDriverBillDueDate(row, billDate);
}
