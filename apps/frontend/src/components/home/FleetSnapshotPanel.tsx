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
    <section className="rounded-sm border border-[#E5E7EB] bg-white">
      <div className="border-b border-[#E5E7EB] px-3 py-2 text-xs font-semibold text-[#0F1219]">Fleet Snapshot</div>
      <div className="space-y-1 px-3 py-2">
        {rows.map((row) => (
          <div key={`${row.leftLabel}-${row.rightLabel}`} className="grid grid-cols-2 gap-2 text-xs">
            <div className="flex items-center justify-between rounded-sm bg-[#F7F8FA] px-2 py-1.5">
              <span className="text-[#4B5563]">{row.leftLabel}</span>
              <span className="font-semibold text-[#0F1219]">{row.leftValue}</span>
            </div>
            <div className="flex items-center justify-between rounded-sm bg-[#F7F8FA] px-2 py-1.5">
              <span className="text-[#4B5563]">{row.rightLabel}</span>
              <span className="font-semibold text-[#0F1219]">{row.rightValue}</span>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
