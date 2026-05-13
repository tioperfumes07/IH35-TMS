type Props = {
  practical?: number;
  shortest?: number;
  deadhead?: number;
  ratePerMile?: number;
};

export function MilesStrip({ practical = 0, shortest = 0, deadhead = 0, ratePerMile = 0 }: Props) {
  const fmt = (n: number) => (Number.isFinite(n) ? n.toLocaleString() : "—");
  const cell = "flex flex-1 flex-col items-center justify-center border-r border-gray-200 px-2 py-2 text-center last:border-r-0";
  return (
    <div className="rounded border border-green-200 bg-white">
      <div className="flex text-[10px] font-semibold uppercase tracking-wide text-green-900">
        <div className={cell}>
          <div className="text-gray-500">Practical</div>
          <div className="font-mono text-sm text-gray-900">{fmt(practical)}</div>
          <div className="text-[9px] font-normal normal-case text-gray-500">fuel + ETA</div>
        </div>
        <div className={`${cell} bg-amber-100`}>
          <div className="text-amber-900">Shortest</div>
          <div className="font-mono text-sm text-amber-950">{fmt(shortest)}</div>
          <div className="text-[9px] font-normal normal-case text-amber-900">driver pay</div>
        </div>
        <div className={cell}>
          <div className="text-gray-500">Deadhead</div>
          <div className="font-mono text-sm text-gray-900">{fmt(deadhead)}</div>
        </div>
        <div className={cell}>
          <div className="text-gray-500">RPM</div>
          <div className="font-mono text-sm text-gray-900">{ratePerMile > 0 ? ratePerMile.toFixed(3) : "—"}</div>
        </div>
      </div>
      <p className="border-t border-green-100 px-2 py-1 text-[9px] text-gray-600">
        Shortest miles (yellow) used for driver pay. Practical used for fuel planning + ETA. Both shown for transparency.
      </p>
    </div>
  );
}
