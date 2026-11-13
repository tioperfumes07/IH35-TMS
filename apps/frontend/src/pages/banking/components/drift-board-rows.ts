/**
 * ROW 97 (LEAD ROUND 8.24) — Banking Home "Reconciliation drift — bank vs book": ONE row per bank account.
 *
 * Root cause (measured live 2026-11-13 18:10Z, USMCA): the detector keeps one open alert per
 * (account, drift_kind) — 7 live_balance + 8 stale_feed — and the board printed every alert as its own row,
 * so Relay Fuel Wallet, Faro Factoring, Dreamline, Amex, England WEX and Faro Escrow each appeared twice with
 * different Bank / Book / Diff figures and nothing saying which is which.
 *
 * Rule: the money a row shows comes from the account's money alert, in this order: session_variance (a
 * reconciliation that did not tie), then live_balance (bank feed balance vs GL). A stale_feed alert carries no
 * money — it says the feed stopped — so it never supplies Bank / Book / Diff; it adds the "Feed stale" issue.
 * Days open = the oldest open alert on the account. The KPI counts accounts with an open alert, not alerts.
 */
import type { DriftAlert } from "../../../api/banking";

export type DriftIssue = "Reconciliation off" | "Bank ≠ book" | "Feed stale";

export type DriftAccountRow = {
  bank_account_id: string;
  alert_ids: string[];
  account_name: string | null;
  account_mask: string | null;
  institution_name: string | null;
  issues: DriftIssue[];
  /** null when the account's only open alert is a stale feed (no money figure exists). */
  bank_cents: number | null;
  book_cents: number | null;
  diff_cents: number | null;
  detected_at: string;
  severity: "warning" | "critical";
};

const MONEY_PRIORITY: Record<DriftAlert["drift_kind"], number> = { session_variance: 0, live_balance: 1, stale_feed: 9 };
const ISSUE: Record<DriftAlert["drift_kind"], DriftIssue> = {
  session_variance: "Reconciliation off",
  live_balance: "Bank ≠ book",
  stale_feed: "Feed stale",
};

export function groupDriftAlertsByAccount(alerts: readonly DriftAlert[]): DriftAccountRow[] {
  const byAccount = new Map<string, DriftAlert[]>();
  for (const a of alerts) {
    const list = byAccount.get(a.bank_account_id) ?? [];
    list.push(a);
    byAccount.set(a.bank_account_id, list);
  }
  const rows: DriftAccountRow[] = [];
  for (const [bankAccountId, list] of byAccount) {
    const sorted = [...list].sort((x, y) => MONEY_PRIORITY[x.drift_kind] - MONEY_PRIORITY[y.drift_kind]);
    const money = sorted.find((a) => a.drift_kind !== "stale_feed") ?? null;
    const named = list.find((a) => a.account_name) ?? list[0];
    const oldest = list.reduce((min, a) => (new Date(a.detected_at) < new Date(min.detected_at) ? a : min), list[0]);
    const issues = [...new Set(sorted.map((a) => ISSUE[a.drift_kind]))];
    rows.push({
      bank_account_id: bankAccountId,
      alert_ids: list.map((a) => a.id),
      account_name: named.account_name,
      account_mask: named.account_mask,
      institution_name: named.institution_name,
      issues,
      bank_cents: money ? Number(money.bank_balance_cents) : null,
      book_cents: money ? Number(money.book_balance_cents) : null,
      diff_cents: money ? Number(money.drift_cents) : null,
      detected_at: oldest.detected_at,
      severity: list.some((a) => a.severity === "critical") ? "critical" : "warning",
    });
  }
  return rows;
}
