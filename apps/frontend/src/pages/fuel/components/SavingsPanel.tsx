type Props = {
  sourceAvailable: boolean;
  driverSavings: number | null;
  fleetSavings: number | null;
  lostSavings: number | null;
  topDriverName: string | null;
  topDriverAmount: number | null;
};

const money = (value: number | null) => value === null ? "Not available" : `$${value.toFixed(2)}`;

export function SavingsPanel({ sourceAvailable, driverSavings, fleetSavings, lostSavings, topDriverName, topDriverAmount }: Props) {
  return (
    <div className="rounded-sm border border-slate-200 bg-white p-3 text-xs">
      <div className="mb-2 text-sm font-semibold text-slate-700">Savings Tracker</div>
      <Row label="Savings YTD (driver)" value={sourceAvailable ? money(driverSavings) : "Not available"} />
      <Row label="Savings YTD (fleet)" value={sourceAvailable ? money(fleetSavings) : "Not available"} />
      <Row label="Highest-saver driver" value={sourceAvailable && topDriverName && topDriverAmount !== null ? `${topDriverName} (${money(topDriverAmount)})` : "Not available"} />
      <Row label="Lost savings YTD from non-compliance" value={sourceAvailable ? money(lostSavings) : "Not available"} valueClass="text-red-700" />
      <Row label="Q4 fuel-purchase bonus pool" value="Not available" />
      <Row label="Driver-of-quarter note" value="Not available" />
    </div>
  );
}

function Row({ label, value, valueClass = "" }: { label: string; value: string; valueClass?: string }) {
  return (
    <div className="flex items-center justify-between border-t border-gray-100 py-1">
      <span className="text-gray-600">{label}</span>
      <span className={`font-medium text-gray-900 ${valueClass}`}>{value}</span>
    </div>
  );
}
