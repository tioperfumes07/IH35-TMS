import type { ReactNode } from "react";
import { spacing } from "../../design/tokens";

/**
 * C-22 / C-32 — shared KPI strip: horizontal tile GRID (6 across on desktop), not a vertical stack.
 * Target block height ≤ 90 px. Each child fills one grid cell; never a full-width row per KPI.
 */
export function KpiStrip({ children }: { children: ReactNode }) {
  return (
    <div
      className="grid w-full grid-cols-2 gap-1.5 sm:grid-cols-3 lg:grid-cols-6"
      style={{ gap: spacing.kpiCardGap, maxHeight: 90 }}
      data-testid="kpi-strip"
      data-c22-kpi-strip="true"
      data-c32-kpi-row="true"
    >
      {children}
    </div>
  );
}
