type Props = {
  driverSavings: number;
  fleetSavings: number;
  lostSavings: number;
  topDriverName: string;
  topDriverAmount: number;
};

export function SavingsPanel({ driverSavings, fleetSavings, lostSavings, topDriverName, topDriverAmount }: Props) {
  return (
    <div className="rounded border border-green-300 bg-white p-3 text-xs">
      <div className="mb-2 text-sm font-semibold text-green-800">Savings Tracker</div>
      <Row label="Savings YTD (driver)" value={`$${driverSavings.toFixed(2)}`} />
      <Row label="Savings YTD (fleet)" value={`$${fleetSavings.toFixed(2)}`} />
      <Row label="Highest-saver driver" value={`${topDriverName} ($${topDriverAmount.toFixed(2)})`} />
      <Row label="Lost savings YTD from non-compliance" value={`$${lostSavings.toFixed(2)}`} valueClass="text-red-700" />
      <Row label="Q4 fuel-purchase bonus pool" value="Phase 3 stub" />
      <Row label="Driver-of-quarter note" value="Phase 3 stub" />
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
