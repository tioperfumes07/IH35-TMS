// TABLE_DATE_OMIT: this table has no date column by design — Diesel by truck is one row per TRUCK aggregated over the period chosen in the board's Oct / Sep / YTD period control — the period is the filter, not a column.
import { useCallback, useMemo } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "../../api/client";
import { getFuelDashboard, getLovesSyncStatus } from "../../api/fuelPlanner";
import { listMaintenanceVehicles } from "../../api/maintenance";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { ListErrorBanner } from "../../components/shared/ListErrorBanner";
import { FuelFraudBadge } from "../../components/fuel/FuelFraudBadge";
import { V3 } from "../../design/v3-tokens";
import { V3KpiTile } from "../../components/v3/V3KpiTile";
import { FuelBoardKpiStrip } from "./components/FuelBoardKpiStrip";
import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
import { MoneyListToolbar } from "../../components/table/MoneyListToolbar";
import { EntityLink } from "../../components/shared/EntityLink";
import { formatMoneyCents } from "../../lib/formatMoney";
import { formatQuantityTable, formatUsdRateTable } from "../../lib/money";
import { QBO_MONEY_CELL_CLASS } from "../../design/qbo-parity";
import { entityLabel } from "../../lib/entity-label";
import { currentOriginHref, withReturnContext } from "../../lib/returnContext";
import { fetchDieselByTruckAggregate, type DieselByTruckRow } from "./fuelDieselByTruck";
import { fuelBoardPeriodOptions, fuelBoardPeriodRange, type FuelBoardPeriodId } from "./fuelBoardPeriod";
import { fuelBoardViewAllHref } from "./fuelBoardViewAllHref";
import { V3Segmented } from "../../components/v3/V3Segmented";
import { FuelBoardSection } from "./FuelBoardSection";
import { FleetTruck } from "../maintenance/components/FleetHealthLine";

type FraudSummary = {
  open_critical: number;
  open_total: number;
};

async function fetchFraudSummary(companyId: string): Promise<FraudSummary> {
  return apiRequest(`/api/v1/fuel/fraud-alerts/summary?operating_company_id=${encodeURIComponent(companyId)}`);
}

/** Off-board CAP-11 tile (RelatedModuleLinks / tests) — not on Fuel.dc.html Home. */
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
      href="/fuel/fraud-alerts"
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

/** BANK-F10 — off-board queue tile (RelatedModuleLinks / tests); not on Fuel.dc.html Home. */
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
  const value = pendingQuery.isError ? "—" : pendingLoaded ? String(pending) : "…";
  const sub = pendingQuery.isError
    ? "Unable to load · BANK-F10 approve-then-recover"
    : pendingLoaded
      ? "Pending review · BANK-F10 approve-then-recover"
      : "Loading… · BANK-F10 approve-then-recover";

  const { pathname, search } = useLocation();
  const originHref = currentOriginHref(pathname, search);
  return (
    <V3KpiTile
      label="Card overage queue"
      value={value}
      sub={sub}
      testId="fuel-card-overage-kpi"
      href={withReturnContext("/fuel/card-overage", originHref)}
    />
  );
}

type DieselBoardRow = DieselByTruckRow & { id: string };

/**
 * Fuel Home — ROUND 443.280 / 443.326 board (docs/design/v3/Fuel.dc.html).
 * KPI strip = FuelBoardKpiStrip (Diesel spend / Gallons / Avg $/gal / Fills without a load /
 * Open questions) from the same diesel aggregate + assignment-questions engines, period-synced
 * with Diesel by truck. Planner dashboard kept only for Love's sync honesty (error + retry).
 * No metric-as-rows theater, no panel-stack chrome.
 */
export function FuelHomePage() {
  const navigate = useNavigate();
  const { pathname, search: locationSearch } = useLocation();
  const originHref = currentOriginHref(pathname, locationSearch);
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  // ROUND 8.17 — typed search in `?q=` so History Back/`ret` restores Home cohort.
  const [searchParams, setSearchParams] = useSearchParams();
  const search = searchParams.get("q") ?? "";
  const setSearch = (value: string) => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (value.trim()) next.set("q", value);
        else next.delete("q");
        return next;
      },
      { replace: true },
    );
  };
  // ROUND 8.20 board 19 — period lives in URL so View all / Back / KPI drills keep the month.
  const periodFromUrl = searchParams.get("period");
  const period: FuelBoardPeriodId =
    periodFromUrl === "oct" || periodFromUrl === "sep" || periodFromUrl === "ytd" ? periodFromUrl : "oct";
  const setPeriod = (next: FuelBoardPeriodId) => {
    setSearchParams(
      (prev) => {
        const p = new URLSearchParams(prev);
        if (next === "oct") p.delete("period");
        else p.set("period", next);
        return p;
      },
      { replace: true },
    );
  };
  const range = fuelBoardPeriodRange(period);

  // Love's sync status — fail-loud banner only (board KPI strip is FuelBoardKpiStrip).
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
  // ROUND 8.17 class L — make/model identity under Unit (Fuel.dc.html "Mack Anthem" subtitle).
  const vehiclesQuery = useQuery({
    queryKey: ["fuel", "board", "diesel-vehicle-identity", companyId],
    queryFn: () => listMaintenanceVehicles(companyId),
    enabled: Boolean(companyId),
    staleTime: 60_000,
  });
  const makeModelByUnitId = useMemo(() => {
    const map = new Map<string, string>();
    for (const v of vehiclesQuery.data?.rows ?? []) {
      const identity = [v.make, v.model].filter(Boolean).join(" ").trim();
      if (identity) map.set(v.id, identity);
    }
    return map;
  }, [vehiclesQuery.data?.rows]);

  const dieselRows = useMemo((): DieselBoardRow[] => {
    const rows = (dieselQuery.data?.rows ?? []).map((r) => ({
      ...r,
      id: r.unit_id ?? `unassigned-${r.unit_number}`,
    }));
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => {
      const identity = r.unit_id ? makeModelByUnitId.get(r.unit_id) ?? "" : "";
      return r.unit_number.toLowerCase().includes(q) || identity.toLowerCase().includes(q);
    });
  }, [dieselQuery.data?.rows, makeModelByUnitId, search]);

  const unitHistoryHref = useCallback(
    (unitId: string | null | undefined) => {
      const target = unitId
        ? `/fuel/history?unit_id=${encodeURIComponent(unitId)}&from=${encodeURIComponent(range.from)}&to=${encodeURIComponent(range.to)}`
        : `/fuel/history?from=${encodeURIComponent(range.from)}&to=${encodeURIComponent(range.to)}`;
      return withReturnContext(target, originHref);
    },
    [originHref, range.from, range.to],
  );

  // Fuel.dc.html seven columns: (graphic) · Unit · Spend · $ · Gallons · $/gal · Fills · Loads.
  const dieselColumns = useMemo<ParityColumn<DieselBoardRow>[]>(
    () => [
      {
        key: "graphic",
        label: "",
        sortable: false,
        minWidth: 96,
        maxWidth: 110,
        render: () => <FleetTruck row={{ state: "ok", body_style: "aero" }} />,
      },
      {
        key: "unit_number",
        label: "Unit",
        sortable: true,
        minWidth: 140,
        sortValue: (r) => r.unit_number,
        render: (r) => {
          const identity = r.unit_id ? makeModelByUnitId.get(r.unit_id) : undefined;
          return (
            <div className="min-w-0" data-testid="fuel-home-diesel-unit-identity">
              {r.unit_id ? (
                <EntityLink
                  kind="unit"
                  id={r.unit_id}
                  label={entityLabel(r.unit_number, r.unit_id, "Unit")}
                  className="font-semibold text-[#1F2A44]"
                />
              ) : (
                <span className="font-semibold">{r.unit_number || "—"}</span>
              )}
              <div className="truncate text-xs text-[#5B6576]">{identity || "—"}</div>
            </div>
          );
        },
      },
      {
        key: "spend_bar",
        label: "Spend",
        sortable: true,
        minWidth: 160,
        sortValue: (r) => r.spend_cents,
        render: (r) => {
          const max = Math.max(1, ...dieselRows.map((x) => x.spend_cents));
          const pct = Math.max(0, Math.min(100, (r.spend_cents / max) * 100));
          // ROUND 8.20 board 19 — Spend bar opens period fuel txs (never fleet/unit profile).
          return (
            <Link
              to={unitHistoryHref(r.unit_id)}
              className="flex min-w-0 items-center"
              data-testid="fuel-home-diesel-spend-bar"
              aria-label={`Open fuel history for ${r.unit_number}`}
            >
              <div className="h-1.5 min-w-[72px] flex-1 rounded-sm bg-[#EEF0F3]" aria-hidden>
                <div className="h-1.5 rounded-sm bg-[#14314F]" style={{ width: `${pct}%` }} />
              </div>
            </Link>
          );
        },
      },
      {
        key: "spend_cents",
        label: "$",
        sortable: true,
        kind: "money",
        minWidth: 88,
        className: QBO_MONEY_CELL_CLASS,
        cellClass: "text-right tabular-nums",
        sortValue: (r) => r.spend_cents,
        // ROUND 8.20 board 19 — $ opens period fuel txs for this unit; `ret` restores Home.
        render: (r) => (
          <Link
            to={unitHistoryHref(r.unit_id)}
            className="shrink-0 whitespace-nowrap tabular-nums font-semibold text-[#1F2A44] hover:underline"
            data-testid="fuel-home-diesel-amount-drill"
          >
            {formatMoneyCents(r.spend_cents)}
          </Link>
        ),
      },
      {
        key: "gallons",
        label: "Gallons",
        sortable: true,
        className: "text-right",
        cellClass: "text-right tabular-nums",
        sortValue: (r) => r.gallons,
        render: (r) =>
          Number.isFinite(r.gallons) ? (
            <Link to={unitHistoryHref(r.unit_id)} className="tabular-nums text-[#1F2A44] hover:underline" data-testid="fuel-home-diesel-gallons-drill">
              {formatQuantityTable(r.gallons, 1)}
            </Link>
          ) : (
            "—"
          ),
      },
      {
        key: "per_gal",
        label: "$/gal",
        sortable: true,
        className: "text-right",
        cellClass: "text-right tabular-nums",
        // ROUND 8.17 N19 — known-volume rate from fuelDieselByTruck (not all-spend / all-gallons).
        sortValue: (r) => r.avg_price_per_gallon ?? Number.POSITIVE_INFINITY,
        render: (r) =>
          r.avg_price_per_gallon != null ? (
            <Link to={unitHistoryHref(r.unit_id)} className="tabular-nums text-[#1F2A44] hover:underline" data-testid="fuel-home-diesel-rate-drill">
              {formatUsdRateTable(r.avg_price_per_gallon, 3)}
            </Link>
          ) : (
            "—"
          ),
      },
      {
        key: "fill_count",
        label: "Fills",
        sortable: true,
        className: "text-right",
        cellClass: "text-right tabular-nums",
        sortValue: (r) => r.fill_count,
        render: (r) => (
          <Link to={unitHistoryHref(r.unit_id)} className="tabular-nums text-[#1F2A44] hover:underline" data-testid="fuel-home-diesel-fills-drill">
            {formatQuantityTable(r.fill_count, 0)}
          </Link>
        ),
      },
      {
        key: "load_count",
        label: "Loads",
        sortable: true,
        className: "text-right",
        cellClass: "text-right tabular-nums",
        sortValue: (r) => r.load_count,
        render: (r) => (
          <Link to={unitHistoryHref(r.unit_id)} className="tabular-nums text-[#1F2A44] hover:underline" data-testid="fuel-home-diesel-loads-drill">
            {formatQuantityTable(r.load_count, 0)}
          </Link>
        ),
      },
    ],
    [dieselRows, makeModelByUnitId, unitHistoryHref],
  );

  if (!companyId) {
    return (
      <div className="space-y-3" data-testid="fuel-home-page" style={{ fontFamily: V3.font }}>
        <FuelBoardSection title="Fuel home" testId="fuel-home-need-company">
          <div className="px-3.5 py-3 text-xs text-gray-700">
            Select an operating company to view the fuel dashboard.
          </div>
        </FuelBoardSection>
      </div>
    );
  }

  return (
    <div className="space-y-3" data-testid="fuel-home-page" style={{ fontFamily: V3.font }}>
      {/* 443.280 board KPIs — period-synced with Diesel by truck (not planner Active Plans chrome). */}
      <FuelBoardKpiStrip companyId={companyId} period={period} />
      {/* Codex QA 11-02: generic Failed-to-load sat above Diesel-by-truck empty success and looked like the diesel board failed. Name the planner source. */}
      {dashboardQuery.isError ? (
        <ListErrorBanner
          message="Fuel planner dashboard (plans / Love's context) could not be loaded — Diesel by truck below uses a separate query."
          onRetry={() => void dashboardQuery.refetch()}
        />
      ) : null}
      {lovesSyncQuery.isError ? (
        <ListErrorBanner message="Love's price sync status could not be loaded." onRetry={() => void lovesSyncQuery.refetch()} />
      ) : null}

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

      <FuelBoardSection
        title="Diesel by truck"
        onViewAll={() => navigate(fuelBoardViewAllHref(period, originHref))}
        testId="fuel-home-diesel-board"
        headerRight={
          <V3Segmented
            value={period}
            options={fuelBoardPeriodOptions()}
            onChange={setPeriod}
            testId="fuel-home-diesel-period"
          />
        }
        footer="Attribution: signed settlement → its load · card truck keeps its fuel · no load → next load · not 100% sure → question with evidence."
      >
        {dieselQuery.isError ? (
          <div className="px-3 py-2" data-testid="fuel-home-diesel-error">
            <ListErrorBanner
              message="Diesel by truck could not be loaded — this is not an empty period."
              onRetry={() => void dieselQuery.refetch()}
            />
          </div>
        ) : (
          <ParityTable<DieselBoardRow>
            appearance="board"
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
        )}
      </FuelBoardSection>
    </div>
  );
}
