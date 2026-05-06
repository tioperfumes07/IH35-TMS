type Props = {
  totalActiveDebt: number | string;
  pendingAckCount: number;
  pendingAckTotal: number;
  proposedDeductions: number;
  isRefreshing: boolean;
  onOpenBreakdown: () => void;
  onOpenEscrow: () => void;
};

export function DebtBanner({
  totalActiveDebt,
  pendingAckCount,
  pendingAckTotal,
  proposedDeductions,
  isRefreshing,
  onOpenBreakdown,
  onOpenEscrow,
}: Props) {
  const numericDebt = typeof totalActiveDebt === "number" ? totalActiveDebt : Number.NaN;
  if (!isRefreshing && (!Number.isFinite(numericDebt) || numericDebt <= 0)) return null;

  return (
    <div className="rounded border border-red-300 bg-red-50 px-3 py-2">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-sm font-semibold text-red-700">
            ⚠ Driver has {isRefreshing ? "Refreshing..." : `$${Number(totalActiveDebt).toFixed(2)}`} in active debt
          </div>
          <div className="text-xs text-red-700">
            {pendingAckCount} pending liability acknowledgments · pending ack total ${pendingAckTotal.toFixed(2)} · this period proposes ${proposedDeductions.toFixed(2)} deductions
          </div>
          <div className="mt-1 flex gap-3 text-xs">
            <button type="button" onClick={onOpenBreakdown} className="text-red-800 underline">View liability breakdown →</button>
            <button type="button" onClick={onOpenEscrow} className="text-red-800 underline">Escrow timeline →</button>
            <span className="text-red-800 underline">Deduction history →</span>
          </div>
        </div>
        <div className="text-sm font-bold text-red-700">
          TOTAL ACTIVE DEBT {isRefreshing ? "Refreshing..." : `$${Number(totalActiveDebt).toFixed(2)}`}
        </div>
      </div>
    </div>
  );
}
