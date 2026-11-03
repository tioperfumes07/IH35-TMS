import { useNavigate } from "react-router-dom";
import type { FuelDashboard, LovesSyncStatus } from "../../../api/fuelPlanner";
import { V3 } from "../../../design/v3-tokens";
import { V3KpiTile, type V3KpiTone } from "../../../components/v3/V3KpiTile";
import { formatDateTimeUS } from "../../../lib/formatDate";
import { formatQuantityTable, formatUsd, formatUsdRateTable } from "../../../lib/money";

type Props = {
  dashboard: FuelDashboard | undefined;
  lovesSyncStatus?: LovesSyncStatus | undefined;
};

/**
 * C8 + ROUND 443.250 — Fuel Home KPI strip.
 *
 * Same seven metrics + Love's sync honesty as the pre-V3 strip. Chrome is V3KpiTile on
 * v3-tokens; click-through via navigate. Absent figure still renders "—".
 */
function lovesSyncTone(
  lovesSyncAt: string | null,
  status?: LovesSyncStatus["status"]
): V3KpiTone {
  if (status === "error") return "red";
  if (!lovesSyncAt) return "muted";
  const ageHours = (Date.now() - new Date(lovesSyncAt).getTime()) / 3600000;
  return ageHours > 2 || status === "stale" ? "muted" : "ink";
}

function formatLovesSyncLabel(
  dashboard: FuelDashboard | undefined,
  lovesSyncStatus: LovesSyncStatus | undefined
) {
  const syncedAt = lovesSyncStatus?.last_synced_at ?? dashboard?.loves_sync_at ?? null;
  if (syncedAt) return formatDateTimeUS(syncedAt) || null;
  // Undefined is unresolved/unavailable, not historical proof that a sync never occurred. Both
  // company-scoped readers must answer successfully before the card may assert "Never".
  if (dashboard === undefined || lovesSyncStatus === undefined) return null;
  return "Never";
}

/** Absent stays absent. */
function metric(raw: number | null | undefined): number | null {
  if (raw === null || raw === undefined) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

/**
 * FUEL-F01 — money KPIs share one helper so grouping cannot drift. Delegates to house
 * formatUsd / formatUsdRateTable (Intl grouping), never bare toFixed.
 */
function fixed(n: number | null, digits: number, prefix = "", suffix = ""): string | null {
  if (n === null) return null;
  if (prefix === "$" && suffix === "") {
    return digits >= 3 ? formatUsdRateTable(n, digits) : digits === 2 ? formatUsdRateTable(n, 2) : formatUsd(n);
  }
  if (suffix === "%") return `${formatQuantityTable(n, digits)}%`;
  return formatQuantityTable(n, digits);
}

const display = (v: string | null) => v ?? "—";

export function FuelKpiRow({ dashboard, lovesSyncStatus }: Props) {
  const navigate = useNavigate();
  const lovesSyncAt = lovesSyncStatus?.last_synced_at ?? dashboard?.loves_sync_at ?? null;
  const activePlans = metric(dashboard?.active_plans);

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit,minmax(120px,1fr))",
        gap: 8,
        fontFamily: V3.font,
      }}
      data-testid="fuel-home-kpi-strip"
      data-fuel-v3-kpis="1"
    >
      <V3KpiTile
        label="Active Plans"
        value={display(activePlans === null ? null : String(activePlans))}
        testId="fuel-kpi-active-plans"
        onClick={() => navigate("/fuel/planner")}
      />
      <V3KpiTile
        label="MTD Spend"
        value={display(fixed(metric(dashboard?.mtd_spend), 0, "$"))}
        sub="diesel · month to date"
        testId="fuel-kpi-mtd-spend"
        onClick={() => navigate("/fuel/history")}
      />
      <V3KpiTile
        label="Avg $/gal"
        // Register row 164 — same precision as the Fuel board strip (3 dp) so one figure reads identically on both.
        value={display(fixed(metric(dashboard?.avg_price_per_gallon), 3, "$"))}
        testId="fuel-kpi-avg-price"
        onClick={() => navigate("/fuel/history")}
      />
      <V3KpiTile
        label="MTD Savings"
        value={display(fixed(metric(dashboard?.mtd_savings), 0, "$"))}
        testId="fuel-kpi-mtd-savings"
        onClick={() => navigate("/fuel/planner")}
      />
      <V3KpiTile
        label="Compliance %"
        value={display(fixed(metric(dashboard?.compliance_pct), 1, "", "%"))}
        testId="fuel-kpi-compliance"
        onClick={() => navigate("/fuel/compliance")}
      />
      <V3KpiTile
        label="Fleet MPG"
        value={display(fixed(metric(dashboard?.fleet_mpg), 1))}
        testId="fuel-kpi-fleet-mpg"
        onClick={() => navigate("/fuel/history")}
      />
      <V3KpiTile
        label="Loves Sync"
        value={display(formatLovesSyncLabel(dashboard, lovesSyncStatus))}
        tone={lovesSyncTone(lovesSyncAt, lovesSyncStatus?.status)}
        testId="fuel-kpi-loves-sync"
        onClick={() => navigate("/fuel/loves-prices")}
      />
    </div>
  );
}
