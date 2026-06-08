type Props = {
  driverUuid: string;
  driverName: string;
  operatingCompanyId: string;
  riskScore: number;
  tier: string;
  topFactors: string[];
};

function tierClass(tier: string) {
  if (tier === "critical") return "bg-red-100 text-red-800";
  if (tier === "at_risk") return "bg-orange-100 text-orange-800";
  if (tier === "watch") return "bg-amber-100 text-amber-800";
  return "bg-emerald-100 text-emerald-800";
}

export function AtRiskDriverCard({ driverUuid, driverName, operatingCompanyId, riskScore, tier, topFactors }: Props) {
  return (
    <article className="rounded border border-gray-200 bg-white p-3" data-testid={`at-risk-driver-card-${driverUuid}`}>
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-gray-900">{driverName}</h3>
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${tierClass(tier)}`}>{tier}</span>
      </div>
      <p className="mt-1 text-xs text-gray-600">Risk score: {riskScore.toFixed(1)}</p>
      {topFactors.length > 0 ? (
        <ul className="mt-2 list-disc pl-4 text-[11px] text-gray-600">
          {topFactors.slice(0, 3).map((factor) => (
            <li key={factor}>{factor}</li>
          ))}
        </ul>
      ) : null}
      <input type="hidden" value={operatingCompanyId} readOnly />
    </article>
  );
}
