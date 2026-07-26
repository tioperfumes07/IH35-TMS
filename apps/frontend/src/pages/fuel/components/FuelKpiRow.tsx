import type { FuelDashboard, LovesSyncStatus } from "../../../api/fuelPlanner";
import { DrillKpiCard } from "../../../components/layout/DrillKpiCard";

type Props = {
  dashboard: FuelDashboard | undefined;
  lovesSyncStatus?: LovesSyncStatus | undefined;
};

/**
 * C8 — the fuel KPI strip.
 *
 * Was: seven hand-rolled <div> tiles, all dead clicks, and every figure `Number(x ?? 0)` so a fuel
 * dashboard that failed to load reported `$0` spend and `0.0` fleet MPG. Now each tile opens the
 * list it summarises and an absent figure renders "—". Same seven labels, same order.
 *
 * The sync-freshness signal is preserved but moved onto the shared card's §7 tones (amber = stale /
 * never synced, red = sync error); the raw text-red-700 / text-green-700 classes the strip used are
 * outside the locked palette.
 */
function lovesSyncTone(
  lovesSyncAt: string | null,
  status?: LovesSyncStatus["status"]
): "default" | "critical" | "warning" {
  if (status === "error") return "critical";
  if (!lovesSyncAt) return "warning";
  const ageHours = (Date.now() - new Date(lovesSyncAt).getTime()) / 3600000;
  return ageHours > 2 || status === "stale" ? "warning" : "default";
}

function formatLovesSyncLabel(
  dashboard: FuelDashboard | undefined,
  lovesSyncStatus: LovesSyncStatus | undefined
) {
  const syncedAt = lovesSyncStatus?.last_synced_at ?? dashboard?.loves_sync_at ?? null;
  if (!syncedAt) return "Never";
  return new Date(syncedAt).toLocaleTimeString();
}

/** Absent stays absent. */
function metric(raw: number | null | undefined): number | null {
  if (raw === null || raw === undefined) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}
const fixed = (n: number | null, digits: number, prefix = "", suffix = "") =>
  n === null ? null : `${prefix}${n.toFixed(digits)}${suffix}`;

export function FuelKpiRow({ dashboard, lovesSyncStatus }: Props) {
  const lovesSyncAt = lovesSyncStatus?.last_synced_at ?? dashboard?.loves_sync_at ?? null;

  return (
    <div className="grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-7">
      <DrillKpiCard label="Active Plans" value={metric(dashboard?.active_plans)} to="/fuel/planner" />
      <DrillKpiCard label="MTD Spend" value={fixed(metric(dashboard?.mtd_spend), 0, "$")} to="/fuel/history" />
      <DrillKpiCard
        label="Avg $/gal"
        value={fixed(metric(dashboard?.avg_price_per_gallon), 2, "$")}
        to="/fuel/history"
      />
      <DrillKpiCard label="MTD Savings" value={fixed(metric(dashboard?.mtd_savings), 0, "$")} to="/fuel/planner" />
      <DrillKpiCard
        label="Compliance %"
        value={fixed(metric(dashboard?.compliance_pct), 1, "", "%")}
        to="/fuel/compliance"
      />
      <DrillKpiCard label="Fleet MPG" value={fixed(metric(dashboard?.fleet_mpg), 1)} to="/fuel/history" />
      <DrillKpiCard
        label="Loves Sync"
        value={formatLovesSyncLabel(dashboard, lovesSyncStatus)}
        valueTone={lovesSyncTone(lovesSyncAt, lovesSyncStatus?.status)}
        to="/fuel/loves-prices"
      />
    </div>
  );
}
