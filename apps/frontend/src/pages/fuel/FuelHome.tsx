import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "../../api/client";
import { getFuelDashboard, getLovesSyncStatus } from "../../api/fuelPlanner";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { FuelFraudBadge } from "../../components/fuel/FuelFraudBadge";
import { FuelKpiRow } from "./components/FuelKpiRow";
import { RelayHistoryImport } from "./components/RelayHistoryImport";

type FraudSummary = {
  open_critical: number;
  open_total: number;
};

async function fetchFraudSummary(companyId: string): Promise<FraudSummary> {
  return apiRequest(`/api/v1/fuel/fraud-alerts/summary?operating_company_id=${encodeURIComponent(companyId)}`);
}

export function FuelFraudAlertsKpiCard() {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";

  const summaryQuery = useQuery({
    queryKey: ["fuel", "fraud-alerts", "summary", companyId],
    queryFn: () => fetchFraudSummary(companyId),
    enabled: Boolean(companyId),
    refetchInterval: 60_000,
  });

  const openCritical = summaryQuery.data?.open_critical ?? 0;
  const tone = openCritical > 0 ? "border-red-300 bg-red-50" : "border-gray-200 bg-white";

  return (
    <Link
      to="/fuel/fraud-alerts"
      className={`block rounded-sm border px-3 py-2 text-[11px] transition hover:shadow-xs ${tone}`}
    >
      <div className="flex items-center gap-1.5 text-[10px] uppercase text-gray-500">
        Open Fraud Alerts
        <FuelFraudBadge hasOpenCritical={openCritical > 0} />
      </div>
      <div className={`text-lg font-semibold ${openCritical > 0 ? "text-red-700" : "text-gray-900"}`}>
        {openCritical}
      </div>
      <div className="text-[10px] text-gray-600">
        {summaryQuery.data?.open_total ?? 0} total open · CAP-11 fraud monitor
      </div>
    </Link>
  );
}

/**
 * Fuel Home tab — wires live planner dashboard KPIs (f-01-fuel-home-stub).
 * Backend GET /api/v1/fuel/planner/dashboard already computes mtd_spend / fleet_mpg / etc.
 * Keeps fraud KPI + Relay import (additive-only).
 */
export function FuelHomePage() {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";

  const dashboardQuery = useQuery({
    queryKey: ["fuel", "planner", "dashboard", companyId],
    queryFn: () => getFuelDashboard(companyId),
    enabled: Boolean(companyId),
  });
  const lovesSyncQuery = useQuery({
    queryKey: ["fuel", "loves-sync", "status", companyId],
    queryFn: () => getLovesSyncStatus(companyId),
    enabled: Boolean(companyId),
    refetchInterval: 60_000,
  });

  return (
    <div className="space-y-3" data-testid="fuel-home-page">
      <FuelKpiRow dashboard={dashboardQuery.data} lovesSyncStatus={lovesSyncQuery.data} />
      {dashboardQuery.isError ? (
        <p className="rounded-sm border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
          Could not load fuel dashboard KPIs. Retry or check fuel planner permissions.
        </p>
      ) : null}
      <div className="max-w-xs">
        <FuelFraudAlertsKpiCard />
      </div>
      <div className="max-w-md">
        <RelayHistoryImport />
      </div>
    </div>
  );
}
