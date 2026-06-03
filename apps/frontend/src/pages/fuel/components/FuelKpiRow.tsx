import type { FuelDashboard, LovesSyncStatus } from "../../../api/fuelPlanner";

type Props = {
  dashboard: FuelDashboard | undefined;
  lovesSyncStatus?: LovesSyncStatus | undefined;
};

function lovesSyncTone(lovesSyncAt: string | null, status?: LovesSyncStatus["status"]) {
  if (!lovesSyncAt) return status === "error" ? "text-red-700" : "text-amber-700";
  const ageHours = (Date.now() - new Date(lovesSyncAt).getTime()) / 3600000;
  if (status === "error") return "text-red-700";
  return ageHours > 2 || status === "stale" ? "text-amber-700" : "text-gray-900";
}

function formatLovesSyncLabel(
  dashboard: FuelDashboard | undefined,
  lovesSyncStatus: LovesSyncStatus | undefined
) {
  const syncedAt = lovesSyncStatus?.last_synced_at ?? dashboard?.loves_sync_at ?? null;
  if (!syncedAt) return "Never";
  return new Date(syncedAt).toLocaleTimeString();
}

export function FuelKpiRow({ dashboard, lovesSyncStatus }: Props) {
  const lovesSyncAt = lovesSyncStatus?.last_synced_at ?? dashboard?.loves_sync_at ?? null;
  const cards = [
    ["Active Plans", `${dashboard?.active_plans ?? 0}`],
    ["MTD Spend", `$${Number(dashboard?.mtd_spend ?? 0).toFixed(0)}`],
    ["Avg $/gal", `$${Number(dashboard?.avg_price_per_gallon ?? 0).toFixed(2)}`],
    ["MTD Savings", `$${Number(dashboard?.mtd_savings ?? 0).toFixed(0)}`],
    ["Compliance %", `${Number(dashboard?.compliance_pct ?? 0).toFixed(1)}%`],
    ["Fleet MPG", `${Number(dashboard?.fleet_mpg ?? 0).toFixed(1)}`],
    ["Loves Sync", formatLovesSyncLabel(dashboard, lovesSyncStatus)],
  ] as const;

  return (
    <div className="grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-7">
      {cards.map(([label, value], idx) => (
        <div key={label} className="rounded border border-gray-200 bg-white px-2 py-1 text-[11px]">
          <div className="text-[10px] uppercase text-gray-500">{label}</div>
          <div className={`font-semibold ${idx === 3 ? "text-green-700" : idx === 6 ? lovesSyncTone(lovesSyncAt, lovesSyncStatus?.status) : ""}`}>
            {value}
          </div>
        </div>
      ))}
    </div>
  );
}
