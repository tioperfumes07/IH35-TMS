import type { SettlementListRow } from "../../api/driverFinance";
import { addDaysIso, companyToday, companyWallClockToIso } from "../../lib/businessDate";
import { formatDateUS } from "../../lib/formatDate";
import { formatUsd } from "../../lib/money";

/** ROUND 443.250 — week buckets for Settlements home "Net driver pay by week". */
export type SettlementsWeekBucket = {
  /** Company-calendar Sunday YYYY-MM-DD (America/Chicago) — canonical week identity + week_start URL. */
  weekStartIso: string;
  /** Chicago midnight instant of weekStartIso (range filters / legacy ms callers). */
  weekStartMs: number;
  label: string;
  net: number;
  gross: number;
  deductions: number;
};

export function formatSettlementsUsd(dollars: number): string {
  return formatUsd(dollars);
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

/**
 * REG-102 / register #159 — Week-of Open/Closed pills follow tour close, not payment_state.
 * trip_closed_at is canonical; terminal settlement statuses without a stamp still count as closed
 * (live: closed/paid rows can keep trip_closed_at NULL — same closedAlready rule as tour-readout).
 */
export function settlementsRowTourClosed(s: SettlementListRow): boolean {
  const raw = s.trip_closed_at;
  if (raw != null && String(raw).trim() !== "") return true;
  const st = String(s.status ?? "").toLowerCase();
  return (
    st === "closed" ||
    st === "paid" ||
    st === "locked" ||
    st === "final" ||
    st === "approved" ||
    st === "cancelled"
  );
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

/**
 * Codex batch92 — Week-of title must match company-calendar week_start, never browser-local midnight
 * reprojected through formatDateUS(Date) (Eastern/UTC Sunday 00:00 → Central previous calendar day).
 * Prefer the YYYY-MM-DD week identity; Date inputs fall back to companyToday of that instant.
 */
export function formatWeekOfTitle(weekStart: Date | string): string {
  if (typeof weekStart === "string") {
    const iso = weekStart.trim().slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return formatDateUS(iso) || "—";
  }
  const d = weekStart instanceof Date ? weekStart : new Date(weekStart);
  if (Number.isNaN(d.getTime())) return "—";
  return formatDateUS(companyToday(d)) || "—";
}

/** Sunday YYYY-MM-DD of the America/Chicago week containing `now` (company calendar, not host TZ). */
export function companyWeekStartSundayIso(now: Date = new Date()): string {
  const today = companyToday(now);
  const [y, m, d] = today.split("-").map(Number);
  // UTC-noon weekday of the calendar parts — date-only, DST-safe, independent of host TZ.
  const dow = new Date(Date.UTC(y, m - 1, d, 12, 0, 0)).getUTCDay();
  return addDaysIso(today, -dow);
}

export function weekBucketLabelFromIso(iso: string): string {
  const m = iso.slice(5, 7);
  const d = iso.slice(8, 10);
  return `${m}-${d}`;
}

/** Chicago midnight instant for a company-calendar YYYY-MM-DD (range filters). */
export function chicagoMidnightMs(iso: string): number {
  const instant = companyWallClockToIso(`${iso}T00:00`);
  if (!instant) return Number.NaN;
  return new Date(instant).getTime();
}

/** Company-calendar YYYY-MM-DD for a settlement period_end (date-only or timestamptz). */
export function settlementPeriodEndIso(periodEnd: string | null | undefined): string | null {
  if (periodEnd == null) return null;
  const raw = String(periodEnd).trim();
  if (!raw) return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(raw) && !/[zZ]|[+-]\d{2}:?\d{2}$/.test(raw.slice(10))) {
    // Bare date or zoneless wall clock — literal calendar day (no TZ shift).
    return raw.slice(0, 10);
  }
  const pe = new Date(raw);
  if (Number.isNaN(pe.getTime())) return null;
  return companyToday(pe);
}

export function buildSettlementsWeekBuckets(
  rows: SettlementListRow[],
  weekCount: number,
  now: Date,
): SettlementsWeekBucket[] {
  const thisWeekIso = companyWeekStartSundayIso(now);
  const buckets: SettlementsWeekBucket[] = [];
  for (let i = weekCount - 1; i >= 0; i--) {
    const startIso = addDaysIso(thisWeekIso, -i * 7);
    const endIso = addDaysIso(startIso, 7);
    let net = 0;
    let gross = 0;
    let deductions = 0;
    for (const s of rows) {
      if (s.status === "cancelled") continue;
      const peIso = settlementPeriodEndIso(s.period_end);
      if (!peIso) continue;
      if (peIso >= startIso && peIso < endIso) {
        net += Number(s.net_pay ?? 0);
        gross += Number(s.gross_pay ?? 0);
        deductions += Number(s.deductions_total ?? 0);
      }
    }
    buckets.push({
      weekStartIso: startIso,
      weekStartMs: chicagoMidnightMs(startIso),
      label: weekBucketLabelFromIso(startIso),
      net,
      gross,
      deductions,
    });
  }
  return buckets;
}

export function resolveSelectedWeekBucket(
  buckets: SettlementsWeekBucket[],
  weekStartParam: string | null,
): SettlementsWeekBucket | null {
  if (!buckets.length) return null;
  if (weekStartParam) {
    const found = buckets.find((w) => w.weekStartIso === weekStartParam);
    if (found) return found;
  }
  return buckets[buckets.length - 1] ?? null;
}
