import type { ReactNode } from "react";
import { spacing } from "../../design/tokens";

/**
 * C-22 / C-32 — shared KPI strip: horizontal tile GRID (6 across on desktop), not a vertical stack.
 * Each tile stays compact; wrapped rows must contribute their full height to page flow.
 */
export function KpiStrip({ children }: { children: ReactNode }) {
  return (
    <div
      className="grid w-full min-w-0 shrink-0 grid-cols-2 gap-1.5 sm:grid-cols-3 lg:grid-cols-6"
      style={{ gap: spacing.kpiCardGap }}
      data-testid="kpi-strip"
      data-c22-kpi-strip="true"
      data-c32-kpi-row="true"
    >
      {children}
    </div>
  );
}
