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
    <div className="grid grid-cols-2 gap-2 md:grid-cols-4 lg:grid-cols-7" data-testid="maint-kpi-rows">
      <DrillKpiCard label="Open WOs" value={isError ? null : pick(kpis.open_wos)} to="/maintenance/active-wos" />
      <DrillKpiCard label="Past Due" value={pastDue} to="/maintenance/pm-schedule" />
      <DrillKpiCard label="Avg Close" value={days(avgCloseDays)} to="/maintenance/work-orders" />
      <DrillKpiCard label="Open $" value={usd(openDollars)} to="/maintenance/active-wos" />
      <DrillKpiCard label="Tire Alerts" value={tireAlerts} to="/maintenance/tire-wear" />
      <DrillKpiCard label="PM Due" value={pmDue} to="/maintenance/pm-schedule" />
      <DrillKpiCard label="DOT O/O" value={dotOo} to="/maintenance/severe-repairs" />
    </div>
  );
}
