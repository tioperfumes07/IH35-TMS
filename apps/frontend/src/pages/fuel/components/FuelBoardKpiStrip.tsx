import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { countOpenFuelAssignmentQuestions } from "../../../api/fuelAssignmentQuestions";
import { V3KpiTile } from "../../../components/v3/V3KpiTile";
import { formatMoneyCents } from "../../../lib/formatMoney";
import { fetchDieselByTruckAggregate } from "../fuelDieselByTruck";
import { fuelBoardPeriodRange, type FuelBoardPeriodId } from "../fuelBoardPeriod";

type Props = {
  companyId: string;
  period?: FuelBoardPeriodId;
};

export function FuelBoardKpiStrip({ companyId, period = "oct" }: Props) {
  const navigate = useNavigate();
  const range = fuelBoardPeriodRange(period);
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

  const agg = aggQuery.data;
  const avgPerGal =
    agg && agg.total_gallons > 0 ? agg.total_spend_cents / 100 / agg.total_gallons : null;
  const spendValue = aggQuery.isError ? "—" : agg ? formatMoneyCents(agg.total_spend_cents) : "…";
  const spendSub =
    agg && !aggQuery.isError
      ? `${agg.fill_count} fills · ${agg.truck_count} trucks`
      : aggQuery.isError
        ? "Unable to load fills"
        : "Loading…";

  const gallonsValue = aggQuery.isError ? "—" : agg ? agg.total_gallons.toFixed(1) : "…";
  const avgValue =
    aggQuery.isError ? "—" : avgPerGal != null ? `$${avgPerGal.toFixed(3)}` : agg ? "—" : "…";
  const noLoadValue = aggQuery.isError ? "—" : agg ? String(agg.fills_without_load) : "…";
  const noLoadTone = agg && agg.fills_without_load === 0 ? "green" : "ink";
  const noLoadSub = agg ? `of ${agg.fill_count}` : "";

  const openCount = openQQuery.data?.count;
  const openValue = openQQuery.isError ? "—" : openCount !== undefined ? String(openCount) : "…";

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
      />
      <V3KpiTile label="Gallons" value={gallonsValue} sub="" testId="fuel-board-kpi-gallons" />
      <V3KpiTile label="Avg $/gal" value={avgValue} sub="" testId="fuel-board-kpi-avg-gal" />
      <V3KpiTile
        label="Fills without a load"
        value={noLoadValue}
        sub={noLoadSub}
        tone={noLoadTone as "green" | "ink"}
        testId="fuel-board-kpi-no-load"
      />
      <V3KpiTile
        label="Open questions"
        value={openValue}
        sub="attribution pop-up"
        testId="fuel-board-kpi-open-questions"
        onClick={() => navigate("/fuel/questions")}
      />
    </div>
  );
}
