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
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2 md:grid-cols-3 lg:grid-cols-6">
        <Card label="Open WOs" value={kpis.open_wos} />
        <Card label="In Shop" value={kpis.in_shop} />
        <Card label="Past Due PM" value={kpis.past_due_pm} />
        <Card label="Out of Service" value={kpis.out_of_service} />
        <Card label="Open Damage" value={kpis.open_damage} />
        <Card label="Avg WO Age" value={`${kpis.avg_wo_age_days.toFixed(1)} d`} />
      </div>
      <div className="grid grid-cols-2 gap-2 md:grid-cols-3 lg:grid-cols-6">
        <Card label="MTD Repair $" value={`$${kpis.mtd_repair_cost.toLocaleString()}`} />
        <Card label="MTD Parts $" value={`$${kpis.mtd_parts_cost.toLocaleString()}`} />
        <Card label="Avg Cost/WO" value={`$${kpis.avg_wo_cost.toLocaleString()}`} />
        <Card label="Top Vendor" value={kpis.top_vendor ?? "-"} />
        <Card label="Top Failure" value={kpis.top_failure ?? "-"} />
        <Card label="Pending QBO" value={kpis.pending_qbo} />
      </div>
    </div>
  );
}
