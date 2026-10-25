/**
 * ROUND 443.326 — KPI strip + bordered FuelBoardSection (no V3Panel).
 * getFuelSavingsSummary values unchanged.
 */
import { V3KpiTile } from "../../../components/v3/V3KpiTile";
import { FuelBoardSection } from "../FuelBoardSection";

type Props = {
  sourceAvailable: boolean;
  driverSavings: number | null;
  fleetSavings: number | null;
  lostSavings: number | null;
  topDriverName: string | null;
  topDriverAmount: number | null;
};

const money = (value: number | null) => (value === null ? "—" : `$${value.toFixed(2)}`);

function kpiMoney(sourceAvailable: boolean, value: number | null): string {
  if (!sourceAvailable) return "—";
  return money(value);
}

export function SavingsPanel({
  sourceAvailable,
  driverSavings,
  fleetSavings,
  lostSavings,
  topDriverName,
  topDriverAmount,
}: Props) {
  const highestSub =
    sourceAvailable && topDriverName && topDriverAmount !== null
      ? `${topDriverName} · ${money(topDriverAmount)}`
      : sourceAvailable
        ? "no top driver yet"
        : "source not available";

  return (
    <div className="space-y-3" data-testid="fuel-savings-panel">
      {/* ROUND 443.250 Savings Tracker V3 — same getFuelSavingsSummary fields as pre-V3 rows. */}
      <div
        style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))", gap: 8 }}
        data-testid="fuel-savings-v3-kpi-strip"
        data-fuel-savings-v3-kpis="1"
      >
        <V3KpiTile
          label="Fleet savings YTD"
          value={kpiMoney(sourceAvailable, fleetSavings)}
          sub="planner compliance savings"
          tone={sourceAvailable && fleetSavings != null && fleetSavings > 0 ? "green" : "ink"}
          testId="fuel-savings-kpi-fleet"
        />
        <V3KpiTile
          label="Driver savings YTD"
          value={kpiMoney(sourceAvailable, driverSavings)}
          sub="top driver YTD"
          testId="fuel-savings-kpi-driver"
        />
        <V3KpiTile
          label="Lost savings YTD"
          value={kpiMoney(sourceAvailable, lostSavings)}
          sub="from non-compliance"
          tone={sourceAvailable && lostSavings != null && lostSavings > 0 ? "red" : "ink"}
          testId="fuel-savings-kpi-lost"
        />
        <V3KpiTile
          label="Highest saver"
          value={sourceAvailable && topDriverName ? topDriverName : "—"}
          sub={highestSub}
          testId="fuel-savings-kpi-highest"
        />
      </div>
      <FuelBoardSection
        title="Savings tracker"
        subtitle="YTD from the fuel planner savings summary"
        testId="fuel-savings-v3-panel"
      >
        <div className="px-3 py-2 text-xs text-[#4B5563]" data-testid="fuel-savings-detail">
          <Row label="Savings YTD (driver)" value={sourceAvailable ? money(driverSavings) : "Not available"} />
          <Row label="Savings YTD (fleet)" value={sourceAvailable ? money(fleetSavings) : "Not available"} />
          <Row
            label="Highest-saver driver"
            value={
              sourceAvailable && topDriverName && topDriverAmount !== null
                ? `${topDriverName} (${money(topDriverAmount)})`
                : "Not available"
            }
          />
          <Row
            label="Lost savings YTD from non-compliance"
            value={sourceAvailable ? money(lostSavings) : "Not available"}
            valueClass="text-red-700"
          />
          <Row label="Q4 fuel-purchase bonus pool" value="Not available" />
          <Row label="Driver-of-quarter note" value="Not available" />
        </div>
      </FuelBoardSection>
    </div>
  );
}

function Row({ label, value, valueClass = "" }: { label: string; value: string; valueClass?: string }) {
  return (
    <div className="flex items-center justify-between border-t border-gray-100 py-1 first:border-t-0">
      <span className="text-gray-600">{label}</span>
      <span className={`font-medium text-gray-900 ${valueClass}`}>{value}</span>
    </div>
  );
}
