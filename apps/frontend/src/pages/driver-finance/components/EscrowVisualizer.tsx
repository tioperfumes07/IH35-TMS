type Props = {
  preClause: number;
  postClause: number;
  target?: number;
  onOpenTimeline: () => void;
};

export function EscrowVisualizer({ preClause, postClause, target = 1000, onOpenTimeline }: Props) {
  const total = preClause + postClause;
  const pct = Math.max(0, Math.min(100, (total / target) * 100));
  return (
    <div className="rounded-sm border border-gray-200 bg-white p-3 text-xs">
      <div className="mb-1 flex items-center justify-between">
        <span className="font-semibold">Escrow</span>
        <span>{pct.toFixed(0)}%</span>
      </div>
      <div className="h-2 w-full rounded-sm bg-gray-200">
        <div className="h-2 rounded-sm bg-slate-600" style={{ width: `${pct}%` }} />
      </div>
      <div className="mt-2 space-y-1">
        <div>Pre-Clause: ${preClause.toFixed(2)}</div>
        <div>Post-Clause: ${postClause.toFixed(2)}</div>
        <div>Forfeiture Clause: <span className="rounded-sm bg-slate-100 px-1 py-0.5 text-slate-700">Active ✓</span></div>
      </div>
      <button type="button" className="mt-2 text-slate-700 underline" onClick={onOpenTimeline}>Escrow timeline →</button>
    </div>
  );
}
