import type { MaintenanceKpis } from "../../../api/maintenance";

type Props = {
  kpis: MaintenanceKpis;
};

function Card({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded border border-gray-200 bg-white px-2 py-1 text-[11px]">
      <div className="text-[10px] uppercase tracking-wide text-gray-500">{label}</div>
      <div className="font-semibold">{value}</div>
    </div>
  );
}

export function MaintKpiRows({ kpis }: Props) {
  const dynamicKpis = kpis as Record<string, unknown>;
  const pastDue = Number(dynamicKpis.past_due ?? kpis.past_due_pm ?? 0);
  const avgCloseDays = Number(dynamicKpis.avg_close_days ?? kpis.avg_wo_age_days ?? 0);
  const openDollars = Number(dynamicKpis.open_dollars ?? kpis.mtd_repair_cost ?? 0);
  const tireAlerts = Number(dynamicKpis.tire_alerts ?? 0);
  const pmDue = Number(dynamicKpis.pm_due ?? kpis.past_due_pm ?? 0);
  const dotOo = Number(dynamicKpis.dot_oos ?? kpis.out_of_service ?? 0);

  return (
    <div className="grid grid-cols-2 gap-2 md:grid-cols-4 lg:grid-cols-7">
        <Card label="Open WOs" value={kpis.open_wos} />
        <Card label="Past Due" value={pastDue} />
        <Card label="Avg Close" value={`${avgCloseDays.toFixed(1)} d`} />
        <Card label="Open $" value={`$${openDollars.toLocaleString()}`} />
        <Card label="Tire Alerts" value={tireAlerts} />
        <Card label="PM Due" value={pmDue} />
        <Card label="DOT O/O" value={dotOo} />
    </div>
  );
}
