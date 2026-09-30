import type { ReactNode } from "react";
import { spacing } from "../../design/tokens";

/** C-22 — shared KPI strip: one row, locked gap, every child fills a consistent tile height. */
export function KpiStrip({ children }: { children: ReactNode }) {
  return (
    <div
      className="flex w-full flex-wrap items-stretch"
      style={{ gap: spacing.kpiCardGap }}
      data-testid="kpi-strip"
      data-c22-kpi-strip="true"
    >
      {children}
    </div>
  );
}
