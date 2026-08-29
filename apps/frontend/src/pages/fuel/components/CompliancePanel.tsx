type Props = {
  sourceAvailable: boolean;
  sentToDriverAt: string | null;
  fleetPct: number | null;
  fleetTotalRecommendations: number | null;
  driverPct: number | null;
};

export function CompliancePanel({ sourceAvailable, sentToDriverAt, fleetPct, fleetTotalRecommendations, driverPct }: Props) {
  return (
    <div className="rounded-sm border border-slate-300 bg-white p-3 text-xs">
      <div className="mb-2 text-sm font-semibold text-slate-700">Compliance Tracker</div>
      <Row label="Sent to driver app" value={sentToDriverAt ? new Date(sentToDriverAt).toLocaleString() : "Not sent"} />
      <Row label="Recommendations followed YTD (driver)" value={!sourceAvailable || driverPct === null ? "Not available" : `${driverPct.toFixed(1)}%`} />
      <Row label="Recommendations followed YTD (fleet)" value={!sourceAvailable || fleetPct === null ? "Not available" : `${fleetPct.toFixed(1)}%`} />
      <Row label="Fleet recommendations tracked" value={!sourceAvailable || fleetTotalRecommendations === null ? "Not available" : `${fleetTotalRecommendations}`} />
      <Row label="Last week non-compliance count" value="Not available" />
      <Row label="Top non-compliance reason" value="Not available" />
      <div className="mt-2 rounded-sm bg-slate-100 px-2 py-1 text-[11px] text-slate-700">Relay match confidence: high when station+timestamp+unit align.</div>
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
