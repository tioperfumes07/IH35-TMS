/**
 * ROUND 435 — ONE TILE SIZE. The tile's shell, label and value classes, exported so a panel that draws its own tile
 * (components/shared/LedgerKpiPanel.tsx) renders the SAME tile as DrillKpiCard instead of a look-alike that drifts.
 * Guard: scripts/verify-faro-kpi-strip.mjs.
 */
export function kpiTileClasses(size: "sm" | "md" = "sm") {
  const compact = size === "sm";
  return {
    shell: "block h-full w-full min-w-0 rounded-sm border px-2 py-1 text-center" + (compact ? " text-[11px]" : ""),
    label: "text-[11px] uppercase tracking-wide text-gray-500",
    value: compact ? "font-semibold" : "mt-1 text-page-title font-semibold text-gray-900",
  };
}
