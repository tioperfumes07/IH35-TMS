type FleetPair = {
  leftLabel: string;
  leftValue: string;
  rightLabel: string;
  rightValue: string;
};

type Props = {
  rows: FleetPair[];
};

export function FleetSnapshotPanel({ rows }: Props) {
  return (
    <section className="rounded border border-slate-200 bg-white">
      <div className="border-b border-slate-200 px-3 py-2 text-sm font-semibold text-slate-900">Fleet Snapshot</div>
      <div className="space-y-1 px-3 py-2">
        {rows.map((row) => (
          <div key={`${row.leftLabel}-${row.rightLabel}`} className="grid grid-cols-2 gap-2 text-xs">
            <div className="flex items-center justify-between rounded bg-slate-50 px-2 py-1.5">
              <span className="text-slate-600">{row.leftLabel}</span>
              <span className="font-semibold text-slate-800">{row.leftValue}</span>
            </div>
            <div className="flex items-center justify-between rounded bg-slate-50 px-2 py-1.5">
              <span className="text-slate-600">{row.rightLabel}</span>
              <span className="font-semibold text-slate-800">{row.rightValue}</span>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
