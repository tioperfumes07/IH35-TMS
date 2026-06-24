import type { MaintenanceKpis } from "../../../api/maintenance";

type Props = {
  kpis: MaintenanceKpis;
};

// R&M Status Board 2nd stat strip (rm-status-board.html) — 8 compact tiles. All values are real,
// entity-scoped counts from /dashboard/kpis. Severe/OOS turns red and Parts Low-Stock amber when > 0
// (§7: red #A32D2D, amber #854F0B), matching the preview's colored tiles.
function Tile({ label, value, tone }: { label: string; value: string | number; tone?: "red" | "amber" }) {
  const valueClass = tone === "red" && value ? "text-[#A32D2D]" : tone === "amber" && value ? "text-[#854F0B]" : "";
  return (
    <div className="rounded border border-gray-200 bg-white px-2 py-1 text-[11px]">
      <div className="text-[10px] uppercase tracking-wide text-gray-500">{label}</div>
      <div className={`font-semibold ${valueClass}`}>{value}</div>
    </div>
  );
}

export function RMStatStrip({ kpis }: Props) {
  const k = kpis as Record<string, unknown>;
  const num = (key: string) => Number(k[key] ?? 0);
  const mtdCost = Number(k.mtd_repair_cost ?? k.open_dollars ?? 0);

  return (
    <div className="grid grid-cols-2 gap-1.5 md:grid-cols-4 lg:grid-cols-8" data-testid="rm-status-stat-strip">
      <Tile label="Open WOs" value={kpis.open_wos} />
      <Tile label="In Progress" value={num("in_progress")} />
      <Tile label="Awaiting Parts" value={num("waiting_parts")} />
      <Tile label="PM Due Soon" value={num("pm_due")} />
      <Tile label="Severe / OOS" value={num("severe_oos")} tone="red" />
      <Tile label="Road Service" value={num("road_service")} />
      <Tile label="Parts Low-Stock" value={num("parts_low_stock")} tone="amber" />
      <Tile label="MTD Cost" value={`$${mtdCost.toLocaleString()}`} />
    </div>
  );
}
