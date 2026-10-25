import type { SettlementListRow } from "../../api/driverFinance";

/** ROUND 443.250 — week buckets for Settlements home "Net driver pay by week". */
export type SettlementsWeekBucket = {
  weekStartMs: number;
  label: string;
  net: number;
  gross: number;
  deductions: number;
};

export function formatSettlementsUsd(dollars: number): string {
  return `$${dollars.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function settlementsWeekLoadsLabel(s: SettlementListRow): string {
  const links = s.load_links ?? [];
  if (links.length) {
    const labels = links.map((l) => l.label).filter(Boolean);
    if (labels.length === 1) return labels[0]!;
    if (labels.length >= 2) return `${labels[0]} – ${labels[labels.length - 1]}`;
  }
  if (s.load_count > 0) return `${s.load_count} load${s.load_count === 1 ? "" : "s"}`;
  return "—";
}

export function settlementsDerivedReimb(s: SettlementListRow): number {
  const gross = Number(s.gross_pay ?? 0);
  const ded = Number(s.deductions_total ?? 0);
  const net = Number(s.net_pay ?? 0);
  const reimb = net - (gross - ded);
  return Math.abs(reimb) < 0.005 ? 0 : reimb;
}

export function settlementsRowTourClosed(s: SettlementListRow): boolean {
  const raw = s.trip_closed_at;
  return raw != null && String(raw).trim() !== "";
}

export function settlementsWeekOfStatusLabel(s: SettlementListRow): "Open" | "Closed" | "Held" | "Cancelled" {
  if (s.status === "cancelled") return "Cancelled";
  if (s.status === "held") return "Held";
  return settlementsRowTourClosed(s) ? "Closed" : "Open";
}

export function settlementPaymentLabel(s: SettlementListRow): "Paid" | "Unpaid" | "Held" {
  if (s.status === "held") return "Held";
  if (s.status === "paid" || s.payment_state === "cleared" || s.payment_state === "manual_paid") return "Paid";
  return "Unpaid";
}

export function formatWeekOfTitle(weekStart: Date): string {
  return weekStart.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
