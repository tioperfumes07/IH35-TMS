import type { MaintenanceKpis } from "../../../api/maintenance";
import { DrillKpiCard } from "../../../components/layout/DrillKpiCard";

type Props = {
  kpis: MaintenanceKpis;
  /** When the dashboard KPI query failed — every tile must show "—", never a fabricated 0. */
  isError?: boolean;
};

/**
 * C8 — the maintenance KPI strip, rendered on every maintenance tab.
 *
 * Was: 7 bare <div> tiles, each reading `Number(x ?? 0)`. Two defects at once — the operator could
 * not click through to the work orders the number counted, and a field the payload does not carry
 * (`tire_alerts` has no producer anywhere) rendered a confident `0` instead of "no data". Now every
 * tile drills to the list it represents, and an absent figure renders "—".
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

export function MaintKpiRows({ kpis, isError = false }: Props) {
  const dynamicKpis = kpis as Record<string, unknown>;
  const pastDue = isError ? null : pick(dynamicKpis.past_due, kpis.past_due_pm);
  const avgCloseDays = isError ? null : pick(dynamicKpis.avg_close_days, kpis.avg_wo_age_days);
  const openDollars = isError ? null : pick(dynamicKpis.open_dollars, kpis.mtd_repair_cost);
  const tireAlerts = isError ? null : pick(dynamicKpis.tire_alerts);
  const pmDue = isError ? null : pick(dynamicKpis.pm_due, kpis.past_due_pm);
  const dotOo = isError ? null : pick(dynamicKpis.dot_oos, kpis.out_of_service);

  return (
    <section className="space-y-1" data-testid="maint-kpi-work-orders">
      <h2 className="text-[11px] font-semibold uppercase tracking-wide text-gray-600">Work orders — live open set</h2>
      <p className="text-[11px] text-gray-500">These seven boxes count work orders and PM alerts, not fleet units. Click any card to open the list it counts.</p>
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4 lg:grid-cols-7" data-testid="maint-kpi-rows">
        <DrillKpiCard
          label="Open WOs"
          value={isError ? null : pick(kpis.open_wos)}
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
    </section>
  );
}
