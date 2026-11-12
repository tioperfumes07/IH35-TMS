import { useQuery } from "@tanstack/react-query";
import { useLocation } from "react-router-dom";
import { countOpenFuelAssignmentQuestions } from "../../../api/fuelAssignmentQuestions";
import { getFuelSpendSummary } from "../../../api/fuelPlanner";
import { V3KpiTile } from "../../../components/v3/V3KpiTile";
import { formatQuantityTable, formatUsd, formatUsdRateTable } from "../../../lib/money";
import { currentOriginHref, withReturnContext } from "../../../lib/returnContext";
import { fetchDieselByTruckAggregate } from "../fuelDieselByTruck";
import { fuelBoardPeriodRange, type FuelBoardPeriodId } from "../fuelBoardPeriod";

type Props = {
  companyId: string;
  period?: FuelBoardPeriodId;
};

export function FuelBoardKpiStrip({ companyId, period = "oct" }: Props) {
  const { pathname, search } = useLocation();
  const originHref = currentOriginHref(pathname, search);
  const range = fuelBoardPeriodRange(period);
  const historyPeriod = withReturnContext(
    `/fuel/history?from=${encodeURIComponent(range.from)}&to=${encodeURIComponent(range.to)}`,
    originHref,
  );
  const historyUnlinked = withReturnContext(
    `/fuel/history?from=${encodeURIComponent(range.from)}&to=${encodeURIComponent(range.to)}&unlinked=1`,
    originHref,
  );
  const aggQuery = useQuery({
    queryKey: ["fuel", "board", "diesel-agg", companyId, range.from, range.to],
    queryFn: () => fetchDieselByTruckAggregate(companyId, range.from, range.to),
    enabled: Boolean(companyId),
  });
  const openQQuery = useQuery({
    queryKey: ["fuel", "assignment-questions", "open-count", companyId],
    queryFn: () => countOpenFuelAssignmentQuestions(companyId),
    enabled: Boolean(companyId),
    refetchInterval: 60_000,
  });

  // Register row 164 — spend / gallons / avg $/gal read THE shared fuel spend reader (GET /fuel/spend-summary), the same
  // backend function Fuel Home's MTD Spend + Avg $/gal read. The per-truck aggregate below only feeds counts (trucks, no-load).
  const spendQuery = useQuery({
    queryKey: ["fuel", "spend-summary", companyId, range.from, range.to],
    queryFn: () => getFuelSpendSummary(companyId, range.from, range.to),
    enabled: Boolean(companyId),
  });
  const agg = aggQuery.data;
  const spend = spendQuery.data;
  const spendValue = spendQuery.isError ? "—" : spend ? formatUsd(spend.spend) : "…";
  const spendSub =
    spend && !spendQuery.isError
      ? `${formatQuantityTable(spend.fill_count, 0)} fills${agg ? ` · ${formatQuantityTable(agg.truck_count, 0)} trucks` : ""}`
      : spendQuery.isError
        ? "Unable to load fills"
        : "Loading…";

  const gallonsValue = spendQuery.isError ? "—" : spend ? formatQuantityTable(spend.gallons, 1) : "…";
  const avgValue =
    spendQuery.isError ? "—" : spend ? (spend.avg_price_per_gallon != null ? formatUsdRateTable(spend.avg_price_per_gallon, 3) : "—") : "…";
  const noLoadValue = aggQuery.isError ? "—" : agg ? formatQuantityTable(agg.fills_without_load, 0) : "…";
  const noLoadTone = agg && agg.fills_without_load === 0 ? "green" : "ink";
  const noLoadSub = agg ? `of ${formatQuantityTable(agg.fill_count, 0)}` : "";

  const openCount = openQQuery.data?.count;
  const openValue = openQQuery.isError ? "—" : openCount !== undefined ? formatQuantityTable(openCount, 0) : "…";

  return (
    <div
      data-testid="fuel-board-kpi-strip"
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))",
        gap: 8,
      }}
    >
      <V3KpiTile
        label={`Diesel spend · ${range.labelSuffix}`}
        value={spendValue}
        sub={spendSub}
        testId="fuel-board-kpi-diesel-spend"
        href={historyPeriod}
      />
      <V3KpiTile
        label="Gallons"
        value={gallonsValue}
        sub=""
        testId="fuel-board-kpi-gallons"
        href={historyPeriod}
      />
      <V3KpiTile
        label="Avg $/gal"
        value={avgValue}
        sub=""
        testId="fuel-board-kpi-avg-gal"
        href={historyPeriod}
      />
      <V3KpiTile
        label="Fills without a load"
        value={noLoadValue}
        sub={noLoadSub}
        tone={noLoadTone as "green" | "ink"}
        testId="fuel-board-kpi-no-load"
        // ROUND 8.17 class S — no-load opens the period's unlinked fills only (never all history).
        href={historyUnlinked}
      />
      <V3KpiTile
        label="Open questions"
        value={openValue}
        sub="attribution pop-up"
        testId="fuel-board-kpi-open-questions"
        href={withReturnContext("/fuel/questions", originHref)}
      />
    </div>
  );
}
