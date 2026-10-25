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
import { FuelKpiRow } from "./components/FuelKpiRow";
import { RelayHistoryImport } from "./components/RelayHistoryImport";
import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
import { MoneyListToolbar } from "../../components/table/MoneyListToolbar";
import { EntityLink } from "../../components/shared/EntityLink";
import { formatMoneyCents } from "../../lib/formatMoney";
import { entityLabel } from "../../lib/entity-label";
import { fetchDieselByTruckAggregate, type DieselByTruckRow } from "./fuelDieselByTruck";
import { FUEL_BOARD_PERIOD_OPTIONS, fuelBoardPeriodRange, type FuelBoardPeriodId } from "./fuelBoardPeriod";
import { V3Segmented } from "../../components/v3/V3Segmented";
import { FuelBoardSection } from "./FuelBoardSection";

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

type DieselBoardRow = DieselByTruckRow & { id: string };

/**
 * Fuel Home — ROUND 443.326 full board rebuild.
 * KPI strip = planner dashboard engine (FuelKpiRow). Roster = diesel-by-truck ParityTable
 * (same aggregate as the old panel). No metric-as-rows theater, no panel-stack chrome.
 */
export function FuelHomePage() {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const [search, setSearch] = useState("");
  const [period, setPeriod] = useState<FuelBoardPeriodId>("oct");
  const range = fuelBoardPeriodRange(period);

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
  const dieselQuery = useQuery({
    queryKey: ["fuel", "board", "diesel-by-truck", companyId, range.from, range.to],
    queryFn: () => fetchDieselByTruckAggregate(companyId, range.from, range.to),
    enabled: Boolean(companyId),
  });

  const dieselRows = useMemo((): DieselBoardRow[] => {
    const rows = (dieselQuery.data?.rows ?? []).map((r) => ({
      ...r,
      id: r.unit_id ?? `unassigned-${r.unit_number}`,
    }));
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => r.unit_number.toLowerCase().includes(q));
  }, [dieselQuery.data?.rows, search]);

  const dieselColumns = useMemo<ParityColumn<DieselBoardRow>[]>(
    () => [
      {
        key: "unit_number",
        label: "Unit",
        sortable: true,
        sortValue: (r) => r.unit_number,
        render: (r) =>
          r.unit_id ? (
            <EntityLink kind="unit" id={r.unit_id} label={entityLabel(r.unit_number, r.unit_id, "Unit")} />
          ) : (
            r.unit_number || "—"
          ),
      },
      {
        key: "spend_cents",
        label: "Spend",
        sortable: true,
        className: "text-right",
        cellClass: "text-right tabular-nums",
        sortValue: (r) => r.spend_cents,
        render: (r) => formatMoneyCents(r.spend_cents),
      },
      {
        key: "gallons",
        label: "Gallons",
        sortable: true,
        className: "text-right",
        cellClass: "text-right tabular-nums",
        sortValue: (r) => r.gallons,
        render: (r) => (Number.isFinite(r.gallons) ? r.gallons.toFixed(1) : "—"),
      },
      {
        key: "per_gal",
        label: "$/gal",
        sortable: true,
        className: "text-right",
        cellClass: "text-right tabular-nums",
        sortValue: (r) => (r.gallons > 0 ? r.spend_cents / r.gallons : 0),
        render: (r) =>
          r.gallons > 0 ? formatMoneyCents(Math.round(r.spend_cents / r.gallons)) : "—",
      },
      {
        key: "fill_count",
        label: "Fills",
        sortable: true,
        className: "text-right",
        cellClass: "text-right tabular-nums",
        sortValue: (r) => r.fill_count,
        render: (r) => String(r.fill_count),
      },
      {
        key: "load_count",
        label: "Loads",
        sortable: true,
        className: "text-right",
        cellClass: "text-right tabular-nums",
        sortValue: (r) => r.load_count,
        render: (r) => String(r.load_count),
      },
    ],
    [],
  );

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

      <MoneyListToolbar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search unit…"
        onClearAll={() => setSearch("")}
        activeFilterCount={search.trim() ? 1 : 0}
        testIdPrefix="fuel-home"
      >
        {null}
      </MoneyListToolbar>

      {dieselQuery.isError ? <ListErrorBanner onRetry={() => void dieselQuery.refetch()} /> : null}
      <FuelBoardSection
        title="Diesel by truck"
        onViewAll={() => navigate("/fuel/by-truck")}
        testId="fuel-home-diesel-board"
        headerRight={
          <V3Segmented
            value={period}
            options={FUEL_BOARD_PERIOD_OPTIONS}
            onChange={setPeriod}
            testId="fuel-home-diesel-period"
          />
        }
        footer="Attribution: signed settlement → its load · card truck keeps its fuel · no load → next load · not 100% sure → question with evidence."
      >
        <ParityTable<DieselBoardRow>
          title="Diesel by truck"
          columns={dieselColumns}
          rows={dieselRows}
          rowKey={(r) => r.id}
          loading={dieselQuery.isLoading}
          emptyText="No diesel spend for this period."
          suppressToolbarSearch
          storageKey="fuel-home-diesel-by-truck"
          tableTestId="fuel-home-diesel-table"
        />
      </FuelBoardSection>

      <FuelBoardSection title="Relay history import" testId="fuel-home-relay-import">
        <div className="p-3">
          <RelayHistoryImport operatingCompanyId={companyId} />
        </div>
      </FuelBoardSection>
    </div>
  );
}
