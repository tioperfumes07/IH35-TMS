import type { MoneyTone } from "../design/money-design-system";

// ROUND-20.8 B11 — CONTRADICTION FIXED. /banking read "QBO Sync: Not connected | Last sync: n/a"
// while /accounting read "QBO SYNC 0 pending — queue healthy" at the same moment. Both were telling
// the truth about two DIFFERENT facts (the OAuth connection state vs the sync-queue backlog) but
// displaying only one fact each, so a reader saw what looked like one ledger giving two answers.
// This is the single derivation both screens now call with the same two inputs — SOURCE:
// GET /api/v1/integrations/qbo/status (connection) + GET /api/v1/integrations/qbo/sync-queue/stats
// (queue). Banking already fetches both (see BankingHome.tsx's qboConnectionQuery/qboSyncStatsQuery);
// /accounting's AccountingHubPage.tsx currently only fetches the queue half — CC-1 (ROUND 20.9 item
// 2) adds the connection fetch and calls this same function, per the coordination note in
// docs/bus/INBOX-CC-1.md, so the two screens can never diverge again.
export type QboSyncInputs = { connected: boolean; pending: number; failed: number };
export type QboSyncSummary = { label: string; tone: MoneyTone; sub: string };

export function describeQboSyncStatus({ connected, pending, failed }: QboSyncInputs): QboSyncSummary {
  if (!connected) {
    return {
      label: "Not connected",
      tone: "bad",
      sub: pending > 0 ? `${pending} item(s) queued, held until reconnected` : "no active QuickBooks connection",
    };
  }
  if (failed > 0) return { label: `${failed} failed`, tone: "bad", sub: `${pending} pending` };
  if (pending > 0) return { label: `${pending} pending`, tone: "warn", sub: "queue draining" };
  return { label: "Healthy", tone: "good", sub: "queue empty" };
}
