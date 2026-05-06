type Props = {
  syncedAt: string | null;
  transactionCount: number;
  uncategorizedCount: number;
  pendingSyncCount: number;
};

export function SyncStatusStrip({ syncedAt, transactionCount, uncategorizedCount, pendingSyncCount }: Props) {
  return (
    <div className="rounded border border-gray-200 bg-white px-3 py-2 text-xs">
      <span className="font-semibold">QBO Sync:</span>{" "}
      <span className="text-green-700">Connected</span>
      <span className="mx-2 text-gray-400">|</span>
      Last sync: {syncedAt ? new Date(syncedAt).toLocaleString() : "n/a"}
      <span className="mx-2 text-gray-400">|</span>
      Transactions: {transactionCount}
      <span className="mx-2 text-gray-400">|</span>
      Uncategorized: {uncategorizedCount}
      <span className="mx-2 text-gray-400">|</span>
      Pending QBO sync: {pendingSyncCount}
    </div>
  );
}
