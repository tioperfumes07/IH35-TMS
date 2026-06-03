import type { PlaidBankAccount } from "../../../api/banking";

const MS_PER_HOUR = 3_600_000;

export type PlaidConnectionBadgeLabel =
  | "Healthy"
  | "Stale"
  | "Out of sync"
  | "Never synced"
  | "Login Required"
  | "Error"
  | "Pending"
  | "Disconnected"
  | "Unknown";

function syncRank(s: PlaidBankAccount["sync_status"]): number {
  switch (s) {
    case "error":
      return 4;
    case "needs_reauth":
      return 3;
    case "pending":
      return 2;
    case "active":
      return 1;
    case "disconnected":
      return 0;
    default:
      return 0;
  }
}

export function worstPlaidSyncStatus(accounts: PlaidBankAccount[]): PlaidBankAccount["sync_status"] | null {
  let worst: PlaidBankAccount["sync_status"] | null = null;
  let rank = -1;
  for (const a of accounts) {
    const r = syncRank(a.sync_status);
    if (r > rank) {
      rank = r;
      worst = a.sync_status;
    }
  }
  return worst;
}

export function latestPlaidLastSyncedAtMs(accounts: PlaidBankAccount[]): number {
  return accounts
    .map((a) => (a.last_synced_at ? new Date(a.last_synced_at).getTime() : 0))
    .reduce((a, b) => Math.max(a, b), 0);
}

export function derivePlaidConnectionBadgeLabel(
  accounts: PlaidBankAccount[],
  nowMs = Date.now()
): PlaidConnectionBadgeLabel {
  const worst = worstPlaidSyncStatus(accounts);
  if (worst === "needs_reauth") return "Login Required";
  if (worst === "error") return "Error";
  if (worst === "pending") return "Pending";
  if (worst === "disconnected") return "Disconnected";

  const lastSyncMs = latestPlaidLastSyncedAtMs(accounts);
  if (!lastSyncMs) return "Never synced";

  const ageHours = (nowMs - lastSyncMs) / MS_PER_HOUR;
  if (ageHours > 72) return "Out of sync";
  if (ageHours > 24) return "Stale";
  if (worst === "active" || worst === null) return "Healthy";
  return "Unknown";
}

export function derivePlaidConnectionBadgeClasses(label: PlaidConnectionBadgeLabel): string {
  if (label === "Healthy") return "bg-green-100 text-green-800";
  if (label === "Stale") return "bg-amber-100 text-amber-800";
  if (label === "Out of sync" || label === "Never synced") return "bg-red-100 text-red-800";
  if (label === "Login Required") return "bg-amber-100 text-amber-800";
  if (label === "Error") return "bg-red-100 text-red-800";
  if (label === "Pending") return "bg-gray-100 text-gray-700";
  if (label === "Disconnected") return "bg-gray-200 text-gray-600";
  return "bg-gray-100 text-gray-700";
}

export function plaidItemBadgeLabel(accounts: PlaidBankAccount[], nowMs = Date.now()): string {
  return derivePlaidConnectionBadgeLabel(accounts, nowMs);
}

export function plaidItemBadgeClasses(accounts: PlaidBankAccount[], nowMs = Date.now()): string {
  return derivePlaidConnectionBadgeClasses(derivePlaidConnectionBadgeLabel(accounts, nowMs));
}
