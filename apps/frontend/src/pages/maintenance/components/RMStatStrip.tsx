import type { MaintenanceKpis } from "../../../api/maintenance";
import { DrillKpiCard } from "../../../components/layout/DrillKpiCard";

type Props = {
  kpis: MaintenanceKpis;
};

// R&M Status Board 2nd stat strip (rm-status-board.html) — compact tiles, same labels and same
// order as Maintenance-Home.dc.html. Severe/OOS turns red and Parts low-stock amber when > 0 (§7: red #A32D2D, amber
// #854F0B), matching the preview's colored tiles.
//
// C8: each tile now drills to the list it counts, and an absent count renders "—" instead of a
// fabricated 0 — `Number(k[key] ?? 0)` used to make a missing field and a real zero identical.

/** Absent stays absent. */
function count(source: Record<string, unknown>, key: string): number | null {
  const raw = source[key];
  if (raw === null || raw === undefined) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

export function RMStatStrip({ kpis }: Props) {
  const k = kpis as Record<string, unknown>;
  const mtdCostRaw = count(k, "mtd_repair_cost") ?? count(k, "open_dollars");
  const mtdCost = mtdCostRaw === null ? null : mtdCostRaw.toLocaleString("en-US", { style: "currency", currency: "USD" });
  const partsLowStock = count(k, "parts_low_stock");

  // C-36 — drop Open / In Progress / Awaiting Parts / Severe tiles: those four duplicate the
  // Home kanban column counts ~81px below this strip. Keep the four that are NOT column counts.
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4" data-testid="rm-status-stat-strip" data-c36-kpi="non-kanban">
      <DrillKpiCard variant="board" label="PM due soon" value={count(k, "pm_due")} to="/maintenance/pm-schedule" />
      <DrillKpiCard variant="board" label="Road service" value={count(k, "road_service")} to="/maintenance/road-service" />
      <DrillKpiCard
        variant="board"
        label="Parts low-stock"
        value={partsLowStock}
        valueTone={partsLowStock ? "warning" : "default"}
        to="/maintenance/parts-inventory"
      />
      <DrillKpiCard variant="board" label="MTD cost" value={mtdCost} to="/maintenance/work-orders" />
    </div>
  );
}
