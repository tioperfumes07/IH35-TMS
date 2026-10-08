import { EntityLink } from "../shared/EntityLink";
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
  if (tier === "watch") return "bg-[#F7F8FA] text-[#1F2A44]";
  return "bg-[#F7F8FA] text-[#1F2A44]";
}

export function AtRiskDriverCard({ driverUuid, driverName, operatingCompanyId, riskScore, tier, topFactors }: Props) {
  return (
    <article className="rounded-sm border border-gray-200 bg-white p-3" data-testid={`at-risk-driver-card-${driverUuid}`}>
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-xs font-semibold text-gray-900">
          <EntityLink kind="driver" id={driverUuid} label={driverName} data-testid={`at-risk-driver-link-${driverUuid}`} />
        </h3>
        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold uppercase ${tierClass(tier)}`}>{tier}</span>
      </div>
      <p className="mt-1 text-xs text-gray-600">Risk score: {riskScore.toFixed(1)}</p>
      {topFactors.length > 0 ? (
        <ul className="mt-2 list-disc pl-4 text-xs text-gray-600">
          {topFactors.slice(0, 3).map((factor) => (
            <li key={factor}>{factor}</li>
          ))}
        </ul>
      ) : null}
      <input type="hidden" value={operatingCompanyId} readOnly />
    </article>
  );
}
