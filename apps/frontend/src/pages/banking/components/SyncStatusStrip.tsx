type Props = {
  syncedAt: string | null;
  transactionCount: number;
  uncategorizedCount: number;
  pendingSyncCount: number;
  /** Derived from integrations.qbo_connections for the current operating_company_id (revoked_at IS NULL). */
  isConnected: boolean;
};

export function SyncStatusStrip({
  syncedAt,
  transactionCount,
  uncategorizedCount,
  pendingSyncCount,
  isConnected,
}: Props) {
  return (
    <div className="rounded-sm border border-gray-200 bg-white px-3 py-2 text-xs">
      <span className="font-semibold">QBO Sync:</span>{" "}
      <span className="text-slate-700">
        {isConnected ? "Connected" : "Not connected"}
      </span>
      <span className="mx-2 text-gray-400">|</span>
      Last sync: {syncedAt ? new Date(syncedAt).toLocaleString() : "n/a"}
      <span className="mx-2 text-gray-400">|</span>
      Transactions: {transactionCount}
      <span className="mx-2 text-gray-400">|</span>
      Uncategorized: {uncategorizedCount}
      {isConnected ? (
        <>
          <span className="mx-2 text-gray-400">|</span>
          Pending QBO sync: {pendingSyncCount}
        </>
      ) : null}
    </div>
  );
}
