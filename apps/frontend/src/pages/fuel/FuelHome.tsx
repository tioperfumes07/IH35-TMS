import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "../../api/client";
import { getFuelDashboard, getLovesSyncStatus } from "../../api/fuelPlanner";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { ListErrorBanner } from "../../components/shared/ListErrorBanner";
import { FuelFraudBadge } from "../../components/fuel/FuelFraudBadge";
import { V3 } from "../../design/v3-tokens";
import { V3KpiTile } from "../../components/v3/V3KpiTile";
import { V3Panel } from "../../components/v3/V3Panel";
import { FuelKpiRow } from "./components/FuelKpiRow";
import { FuelBoardKpiStrip } from "./components/FuelBoardKpiStrip";
import { FuelDieselByTruckPanel } from "./components/FuelDieselByTruckPanel";
import { RelayHistoryImport } from "./components/RelayHistoryImport";
import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
import { MoneyListToolbar } from "../../components/table/MoneyListToolbar";
import type { FuelDashboard } from "../../api/fuelPlanner";

type FraudSummary = {
  open_critical: number;
  open_total: number;
};

async function fetchFraudSummary(companyId: string): Promise<FraudSummary> {
  return apiRequest(`/api/v1/fuel/fraud-alerts/summary?operating_company_id=${encodeURIComponent(companyId)}`);
}

export function FuelFraudAlertsKpiCard() {
  const navigate = useNavigate();
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
  // GO-0027-HOME-F: a failed fetch must never render as "0 Open Fraud Alerts" -- matches
  // the sibling FuelCardOverageKpiCard's own isError ? "—" : value contract.
  const value = summaryQuery.isError ? "—" : summaryLoaded ? String(openCritical) : "…";
  const sub = summaryQuery.isError
    ? "Unable to load · CAP-11 fraud monitor"
    : summaryLoaded
      ? `${summaryQuery.data.open_total} total open · CAP-11 fraud monitor`
      : "Loading… · CAP-11 fraud monitor";

  return (
    <V3KpiTile
      label="Open Fraud Alerts"
      value={value}
      sub={sub}
      spark={<FuelFraudBadge hasOpenCritical={openCritical > 0} />}
      tone={openCritical > 0 ? "red" : "ink"}
      testId="fuel-fraud-alerts-kpi"
      onClick={() => navigate("/fuel/fraud-alerts")}
    />
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
  const navigate = useNavigate();
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
  const value = pendingQuery.isError ? "—" : pendingLoaded ? String(pending) : "…";
  const sub = pendingQuery.isError
    ? "Unable to load · BANK-F10 approve-then-recover"
    : pendingLoaded
      ? "Pending review · BANK-F10 approve-then-recover"
      : "Loading… · BANK-F10 approve-then-recover";

  return (
    <V3KpiTile
      label="Card overage queue"
      value={value}
      sub={sub}
      testId="fuel-card-overage-kpi"
      onClick={() => navigate("/fuel/card-overage")}
    />
  );
}

type FuelMetricRow = { id: string; metric: string; value: string };

function fuelMetricValue(raw: number | null | undefined, formatter: (n: number) => string): string {
  if (raw === null || raw === undefined) return "—";
  const n = Number(raw);
  if (!Number.isFinite(n)) return "—";
  return formatter(n);
}

function buildFuelMetricRows(dashboard: FuelDashboard | undefined): FuelMetricRow[] {
  if (!dashboard) return [];
  return [
    { id: "mtd_spend", metric: "MTD Spend", value: fuelMetricValue(dashboard.mtd_spend, (n) => `$${n.toLocaleString("en-US", { maximumFractionDigits: 0 })}`) },
    { id: "fleet_mpg", metric: "Fleet MPG", value: fuelMetricValue(dashboard.fleet_mpg, (n) => n.toFixed(1)) },
    { id: "avg_price", metric: "Avg $/gal", value: fuelMetricValue(dashboard.avg_price_per_gallon, (n) => `$${n.toFixed(2)}`) },
    { id: "mtd_savings", metric: "MTD Savings", value: fuelMetricValue(dashboard.mtd_savings, (n) => `$${n.toLocaleString("en-US", { maximumFractionDigits: 0 })}`) },
    { id: "compliance", metric: "Compliance %", value: fuelMetricValue(dashboard.compliance_pct, (n) => `${n.toFixed(1)}%`) },
    { id: "active_plans", metric: "Active plans", value: fuelMetricValue(dashboard.active_plans, (n) => String(Math.round(n))) },
  ];
}

const FUEL_METRIC_COLUMNS: ParityColumn<FuelMetricRow>[] = [
  { key: "metric", label: "Metric", sortable: true, sortValue: (row) => row.metric, render: (row) => row.metric },
  { key: "value", label: "Value", sortable: true, sortValue: (row) => row.value, render: (row) => row.value },
];

/**
 * Fuel Home tab — wires live planner dashboard KPIs (f-01-fuel-home-stub).
 * Backend GET /api/v1/fuel/planner/dashboard already computes mtd_spend / fleet_mpg / etc.
 * Keeps fraud KPI + Relay import (additive-only). ROUND 443.250: V3 board chrome.
 */
export function FuelHomePage() {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const [metricSearch, setMetricSearch] = useState("");

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

  const metricRows = useMemo(() => buildFuelMetricRows(dashboardQuery.data), [dashboardQuery.data]);
  const filteredMetricRows = useMemo(() => {
    const q = metricSearch.trim().toLowerCase();
    if (!q) return metricRows;
    return metricRows.filter((row) => row.metric.toLowerCase().includes(q) || row.value.toLowerCase().includes(q));
  }, [metricRows, metricSearch]);

  if (!companyId) {
    return (
      <div
        className="rounded-sm border border-dashed border-gray-300 bg-gray-50 p-4 text-xs text-gray-700"
        data-testid="fuel-home-page"
        style={{ fontFamily: V3.font }}
      >
        Select an operating company to view the fuel dashboard.
      </div>
    );
  }

  return (
    <div className="space-y-3" data-testid="fuel-home-page" style={{ fontFamily: V3.font }}>
      <FuelBoardKpiStrip companyId={companyId} />
      <MoneyListToolbar
        search={metricSearch}
        onSearchChange={setMetricSearch}
        searchPlaceholder="Search dashboard metrics"
        onClearAll={() => setMetricSearch("")}
        activeFilterCount={0}
        testIdPrefix="fuel-home-metrics"
      >
        <span className="text-xs text-gray-500">Planner dashboard</span>
      </MoneyListToolbar>
      <ParityTable<FuelMetricRow>
        title="Dashboard metrics"
        columns={FUEL_METRIC_COLUMNS}
        rows={dashboardQuery.isError ? [] : filteredMetricRows}
        rowKey={(row) => row.id}
        loading={dashboardQuery.isLoading}
        emptyText={dashboardQuery.isError ? "Unable to load fuel dashboard metrics." : "No metrics yet."}
        suppressToolbarSearch
        storageKey="fuel-home-dashboard-metrics"
        tableTestId="fuel-home-metrics-table"
      />
      <FuelDieselByTruckPanel companyId={companyId} maxRows={5} viewAllHref="/fuel/by-truck" />
      <FuelKpiRow dashboard={dashboardQuery.data} lovesSyncStatus={lovesSyncQuery.data} />
      {dashboardQuery.isError ? (
        <ListErrorBanner onRetry={() => void dashboardQuery.refetch()} />
      ) : null}
      {lovesSyncQuery.isError ? (
        <ListErrorBanner message="Love's price sync status could not be loaded." onRetry={() => void lovesSyncQuery.refetch()} />
      ) : null}
      <div
        style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 8, maxWidth: 640 }}
        data-testid="fuel-home-secondary-kpis"
      >
        <FuelFraudAlertsKpiCard />
        <FuelCardOverageKpiCard />
      </div>
      <V3Panel title="Relay history import" subtitle="company-scoped CSV" testId="fuel-home-relay-import-panel">
        <div style={{ padding: "10px 12px" }}>
          <RelayHistoryImport operatingCompanyId={companyId} />
        </div>
      </V3Panel>
    </div>
  );
}
