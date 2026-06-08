import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { apiRequest } from "../../api/client";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { AtRiskDriverCard } from "../../components/drivers/AtRiskDriverCard";

type RetentionRow = {
  driver_uuid: string;
  retention_risk_score: number;
  retention_tier: string;
  contributing_factors: Record<string, number | null>;
};

export function RetentionDashboard() {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";

  const scoresQ = useQuery({
    queryKey: ["drivers", "retention-scores", companyId],
    queryFn: () =>
      apiRequest<{ rows: RetentionRow[] }>(
        `/api/v1/drivers/retention-scores?operating_company_id=${encodeURIComponent(companyId)}&tier=at_risk`
      ),
    enabled: Boolean(companyId),
  });

  const rows = scoresQ.data?.rows ?? [];

  return (
    <div className="space-y-4 p-4" data-testid="driver-retention-dashboard">
      <div>
        <h1 className="text-lg font-semibold text-gray-900">Driver Retention Risk</h1>
        <p className="text-xs text-gray-600">GAP-71 predictive model · at-risk and critical drivers</p>
      </div>
      {!companyId ? <p className="text-sm text-gray-500">Select operating company.</p> : null}
      {scoresQ.isLoading ? <p className="text-sm text-gray-500">Loading retention scores…</p> : null}
      <div className="grid gap-3 md:grid-cols-2">
        {rows.map((row) => {
          const factors = Object.entries(row.contributing_factors ?? {})
            .filter(([, v]) => v != null)
            .map(([k, v]) => `${k.replace(/_/g, " ")}: ${v}`);
          return (
            <Link key={row.driver_uuid} to={`/drivers/${row.driver_uuid}`}>
              <AtRiskDriverCard
                driverUuid={row.driver_uuid}
                driverName={row.driver_uuid.slice(0, 8)}
                operatingCompanyId={companyId}
                riskScore={row.retention_risk_score}
                tier={row.retention_tier}
                topFactors={factors}
              />
            </Link>
          );
        })}
      </div>
    </div>
  );
}
