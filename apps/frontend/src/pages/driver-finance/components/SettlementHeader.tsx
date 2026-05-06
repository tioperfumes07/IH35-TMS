type Props = {
  driverName: string;
  driverDisplayId: string;
  periodStart: string;
  periodEnd: string;
  status: string;
  computedAt: string | null;
  onRefresh: () => void;
};

export function SettlementHeader({ driverName, driverDisplayId, periodStart, periodEnd, status, computedAt, onRefresh }: Props) {
  return (
    <div className="grid grid-cols-1 gap-2 rounded border border-gray-200 bg-white p-3 lg:grid-cols-4">
      <div>
        <div className="text-[10px] uppercase text-gray-500">Driver</div>
        <div className="text-sm font-semibold">{driverName}</div>
        <div className="text-xs text-gray-500">{driverDisplayId}</div>
      </div>
      <div>
        <div className="text-[10px] uppercase text-gray-500">Settlement Period</div>
        <div className="text-sm font-semibold">{periodStart} — {periodEnd}</div>
      </div>
      <div>
        <div className="text-[10px] uppercase text-gray-500">Loads in cycle</div>
        <div className="text-sm">—</div>
      </div>
      <div className="text-right">
        <div className="text-[10px] uppercase text-gray-500">Status</div>
        <div className="text-sm font-semibold">{status}</div>
        <div className="mt-1 text-[10px] text-gray-500">Recompute: {computedAt ?? "n/a"}</div>
        <button type="button" className="mt-1 text-xs text-blue-700 underline" onClick={onRefresh}>Refresh</button>
      </div>
    </div>
  );
}
