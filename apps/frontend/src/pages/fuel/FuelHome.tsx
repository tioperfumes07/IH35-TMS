import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "../../api/client";
import { getFuelDashboard, getLovesSyncStatus } from "../../api/fuelPlanner";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { ListErrorBanner } from "../../components/shared/ListErrorBanner";
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

  const summaryLoaded = summaryQuery.data !== undefined;
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
        {/* GO-0027-HOME-F: a failed fetch must never render as "0 Open Fraud Alerts" -- matches
            the sibling FuelCardOverageKpiCard's own isError ? "—" : value contract. */}
        {summaryQuery.isError ? "—" : summaryLoaded ? openCritical : "…"}
      </div>
      <div className="text-[10px] text-gray-600">
        {summaryQuery.isError
          ? "Unable to load"
          : summaryLoaded
            ? `${summaryQuery.data.open_total} total open`
            : "Loading…"} · CAP-11 fraud monitor
      </div>
    </Link>
  );
}

type OveragePendingSummary = {
  events: unknown[];
  total_count: number;
};

async function fetchOveragePending(companyId: string): Promise<OveragePendingSummary> {
  const params = new URLSearchParams({
    operating_company_id: companyId,
    status: "pending_review",
    limit: "1",
  });
  return apiRequest(`/api/v1/fuel/card-overage-events?${params.toString()}`);
}

/** BANK-F10 — reachable from Fuel Home (does not add a Fuel sub-nav tab). */
export function FuelCardOverageKpiCard() {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";

  const pendingQuery = useQuery({
    queryKey: ["fuel", "card-overage-events", "pending-summary", companyId],
    queryFn: () => fetchOveragePending(companyId),
    enabled: Boolean(companyId),
    refetchInterval: 60_000,
    retry: false,
  });

  const pendingLoaded = pendingQuery.data !== undefined;
  const pending = pendingQuery.data?.total_count ?? 0;
  // §7 palette — non-financial UI: slate only (no amber/emerald status classes).
  const tone = pending > 0 ? "border-slate-300 bg-slate-100" : "border-gray-200 bg-white";

  return (
    <Link
      to="/fuel/card-overage"
      className={`block rounded-sm border px-3 py-2 text-[11px] transition hover:shadow-xs ${tone}`}
      data-testid="fuel-card-overage-kpi"
    >
      <div className="text-[10px] uppercase text-gray-500">Card overage queue</div>
      <div className={`text-lg font-semibold ${pending > 0 ? "text-slate-800" : "text-gray-900"}`}>
        {pendingQuery.isError ? "—" : pendingLoaded ? pending : "…"}
      </div>
      <div className="text-[10px] text-gray-600">
        {pendingQuery.isError ? "Unable to load" : pendingLoaded ? "Pending review" : "Loading…"} · BANK-F10 approve-then-recover
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

  if (!companyId) {
    return (
      <div className="rounded-sm border border-dashed border-gray-300 bg-gray-50 p-4 text-sm text-gray-700" data-testid="fuel-home-page">
        Select an operating company to view the fuel dashboard.
      </div>
    );
  }

  return (
    <div className="space-y-3" data-testid="fuel-home-page">
      <FuelKpiRow dashboard={dashboardQuery.data} lovesSyncStatus={lovesSyncQuery.data} />
      {dashboardQuery.isError ? (
        <ListErrorBanner onRetry={() => void dashboardQuery.refetch()} />
      ) : null}
      {lovesSyncQuery.isError ? (
        <ListErrorBanner message="Love's price sync status could not be loaded." onRetry={() => void lovesSyncQuery.refetch()} />
      ) : null}
      <div className="grid max-w-2xl grid-cols-1 gap-2 sm:grid-cols-2">
        <FuelFraudAlertsKpiCard />
        <FuelCardOverageKpiCard />
      </div>
      <div className="max-w-md">
        <RelayHistoryImport operatingCompanyId={companyId} />
      </div>
    </div>
  );
}
