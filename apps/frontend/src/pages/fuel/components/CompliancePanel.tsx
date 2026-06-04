type Props = {
  sentToDriverAt: string | null;
  fleetPct: number;
  fleetTotalRecommendations: number;
  driverPct: number;
};

export function CompliancePanel({ sentToDriverAt, fleetPct, fleetTotalRecommendations, driverPct }: Props) {
  return (
    <div className="rounded border border-blue-300 bg-white p-3 text-xs">
      <div className="mb-2 text-sm font-semibold text-blue-800">Compliance Tracker</div>
      <Row label="Sent to driver app" value={sentToDriverAt ? new Date(sentToDriverAt).toLocaleString() : "Not sent"} />
      <Row label="Recommendations followed YTD (driver)" value={`${driverPct.toFixed(1)}%`} />
      <Row label="Recommendations followed YTD (fleet)" value={`${fleetPct.toFixed(1)}%`} />
      <Row label="Fleet recommendations tracked" value={`${fleetTotalRecommendations}`} />
      <Row label="Last week non-compliance count" value="Not available yet" />
      <Row label="Top non-compliance reason" value="Not available yet" />
      <div className="mt-2 rounded bg-blue-50 px-2 py-1 text-[11px] text-blue-700">Relay match confidence: high when station+timestamp+unit align.</div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between border-t border-gray-100 py-1">
      <span className="text-gray-600">{label}</span>
      <span className="font-medium text-gray-900">{value}</span>
    </div>
  );
}
