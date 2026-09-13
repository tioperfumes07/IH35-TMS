import { MONEY_TONE_COLORS } from "../../../design/money-design-system";
import { describeQboSyncStatus } from "../../../lib/qbo-sync-status";

type Props = {
  syncedAt: string | null;
  transactionCount: number;
  uncategorizedCount: number;
  pendingSyncCount: number;
  failedSyncCount?: number;
  /** Derived from integrations.qbo_connections for the current operating_company_id (revoked_at IS NULL). */
  isConnected: boolean;
};

// ROUND-20.8 B11 — this strip now renders describeQboSyncStatus()'s own words, the SAME function
// /accounting's QBO Sync tile calls, so "Connected"/"pending"/"Healthy" can never read differently
// on the two screens for the same underlying state.
export function SyncStatusStrip({
  syncedAt,
  transactionCount,
  uncategorizedCount,
  pendingSyncCount,
  failedSyncCount = 0,
  isConnected,
}: Props) {
  const summary = describeQboSyncStatus({ connected: isConnected, pending: pendingSyncCount, failed: failedSyncCount });
  const toneColor = MONEY_TONE_COLORS[summary.tone].text;
  return (
    <div className="rounded-sm border border-gray-200 bg-white px-3 py-2 text-xs" data-testid="banking-sync-status-strip">
      <span className="font-semibold">QBO Sync:</span>{" "}
      <span style={{ color: toneColor, fontWeight: 600 }}>{summary.label}</span>
      <span className="ml-1 text-gray-500">({summary.sub})</span>
      <span className="mx-2 text-gray-400">|</span>
      Last sync: {syncedAt ? new Date(syncedAt).toLocaleString() : "n/a"}
      <span className="mx-2 text-gray-400">|</span>
      Transactions: {transactionCount}
      <span className="mx-2 text-gray-400">|</span>
      Uncategorized: {uncategorizedCount}
    </div>
  );
}
