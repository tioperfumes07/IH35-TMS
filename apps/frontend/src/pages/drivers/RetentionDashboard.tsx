import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "../../api/client";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { AtRiskDriverCard } from "../../components/drivers/AtRiskDriverCard";
import { entityLabel } from "../../lib/entity-label";
import { PageHeader } from "../../components/layout/PageHeader";
import { ListErrorState } from "../../components/ListErrorState";

type RetentionRow = {
  driver_uuid: string;
  driver_name?: string | null;
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

  // DRIVER-F6460: React Query retains prior data after a failed refetch. Do not
  // leave stale risk cards actionable underneath the explicit error state.
  const rows = scoresQ.isError ? [] : scoresQ.data?.rows ?? [];

  return (
    <div className="space-y-4 p-4" data-testid="driver-retention-dashboard">
      <PageHeader
        title="Driver Retention Risk"
        subtitle="GAP-71 predictive model · at-risk and critical drivers"
        breadcrumb={["Drivers", "Retention Risk"]}
        backHref="/drivers"
      />
      {!companyId ? <p className="text-sm text-gray-500">Select operating company.</p> : null}
      {scoresQ.isLoading ? <p className="text-sm text-gray-500">Loading retention scores…</p> : null}
      {scoresQ.isError ? (
        <ListErrorState title="Couldn't load retention scores" status={0} message={(scoresQ.error as Error)?.message} onRetry={() => void scoresQ.refetch()} />
      ) : null}
      {scoresQ.isSuccess && rows.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-300 bg-white p-6 text-center" data-testid="driver-retention-empty-state">
          <p className="font-medium text-gray-900">No at-risk drivers</p>
          <p className="mt-1 text-sm text-gray-500">
            No current retention scores are in the at-risk or critical tiers for this operating company.
          </p>
        </div>
      ) : null}
      <div className="grid gap-3 md:grid-cols-2">
        {rows.map((row) => {
          const factors = Object.entries(row.contributing_factors ?? {})
            .filter(([, v]) => v != null)
            .map(([k, v]) => `${k.replace(/_/g, " ")}: ${v}`);
          return (
            <AtRiskDriverCard
              key={row.driver_uuid}
              driverUuid={row.driver_uuid}
              driverName={entityLabel(row.driver_name, row.driver_uuid, "Driver")}
              operatingCompanyId={companyId}
              riskScore={row.retention_risk_score}
              tier={row.retention_tier}
              topFactors={factors}
            />
          );
        })}
      </div>
    </div>
  );
}
