import type { MaintenanceKpis } from "../../../api/maintenance";
import { DrillKpiCard } from "../../../components/layout/DrillKpiCard";
import { ListErrorState } from "../../../components/ListErrorState";

type Props = {
  kpis: MaintenanceKpis;
  /** When the dashboard KPI query failed — strip fails closed with one recovery, never seven unavailable tiles. */
  isError?: boolean;
  /** Optional retry for the parent dashboard KPI query (error strip only). */
  onRetry?: () => void;
  /** D10/D32 — list tabs drop the prose header so the KPI strip stays one row. */
  compact?: boolean;
};

/**
 * C8 / C-22 — the maintenance KPI strip, rendered on every maintenance tab.
 *
 * Was: 7 bare <div> tiles, each reading `Number(x ?? 0)`. Two defects at once — the operator could
 * not click through to the work orders the number counted, and a field the payload does not carry
 * (`tire_alerts` has no producer anywhere) rendered a confident `0` instead of "no data". Now every
 * tile drills to the list it represents; absent figures show why; query failure uses one ListErrorState
 * (BANK-F91429 — do not mint seven `unavailable` DrillKpiCards that blow the C8 shrink-only budget).
 */

/** Absent stays absent: only a real number is shown, never a substituted zero. */
function pick(...candidates: Array<unknown>): number | null {
  for (const candidate of candidates) {
    if (candidate === null || candidate === undefined) continue;
    const n = Number(candidate);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

const days = (n: number | null) => (n === null ? null : `${n.toFixed(1)} d`);
const usd = (n: number | null) => (n === null ? null : `$${n.toLocaleString()}`);

export function MaintKpiRows({ kpis, isError = false, onRetry, compact = false }: Props) {
  const dynamicKpis = kpis as Record<string, unknown>;
  const pastDue = isError ? null : pick(dynamicKpis.past_due, kpis.past_due_pm);
  const avgCloseDays = isError ? null : pick(dynamicKpis.avg_close_days, kpis.avg_wo_age_days);
  const openDollars = isError ? null : pick(dynamicKpis.open_dollars, kpis.mtd_repair_cost);
  const tireAlerts = isError ? null : pick(dynamicKpis.tire_alerts);
  const pmDue = isError ? null : pick(dynamicKpis.pm_due, kpis.past_due_pm);
  const dotOo = isError ? null : pick(dynamicKpis.dot_oos, kpis.out_of_service);

  return (
    <section className="space-y-1" data-testid="maint-kpi-work-orders">
      {!compact ? (
        <>
          <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-600">Work orders — live open set</h2>
          <p className="text-xs text-gray-500">These seven boxes count work orders and PM alerts, not fleet units. Click any card to open the list it counts.</p>
        </>
      ) : null}
      {isError ? (
        <div data-testid="maint-kpi-rows-error">
          <ListErrorState
            title="Couldn't load maintenance KPIs"
            status={0}
            message="Work-order and PM figures are unavailable until the dashboard KPI query recovers."
            onRetry={onRetry}
          />
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4 lg:grid-cols-7" data-testid="maint-kpi-rows" data-c22-kpi-strip="true">
          <DrillKpiCard
            label="Open WOs"
            value={pick(kpis.open_wos)}
            to="/maintenance/active-wos"
            hint="Open / in progress / waiting parts. Not cancelled or complete."
          />
          <DrillKpiCard
            label="Past Due"
            value={pastDue}
            to="/maintenance/pm-schedule"
            hint="Open WO linked to a PM alert triggered before today."
          />
          <DrillKpiCard
            label="Avg Close"
            value={days(avgCloseDays)}
            to="/maintenance/work-orders"
            hint="Mean close time for WOs completed in the last 30 days."
          />
          <DrillKpiCard
            label="Open $"
            value={usd(openDollars)}
            to="/maintenance/active-wos"
            hint="Sum of actual/estimated cost on currently open WOs."
          />
          <DrillKpiCard
            label="Tire Alerts"
            value={tireAlerts}
            to="/maintenance/tire-wear"
            hint="Open work orders with wo_type = tire."
          />
          <DrillKpiCard
            label="PM Due"
            value={pmDue}
            to="/maintenance/pm-schedule"
            hint="PM alerts in state open or acknowledged (no mile window on this tile)."
          />
          <DrillKpiCard
            label="DOT O/O"
            value={dotOo}
            to="/maintenance/severe-repairs"
            hint="Units whose latest DVIR outcome is OOS."
          />
        </div>
      )}
    </section>
  );
}
