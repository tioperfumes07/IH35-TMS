import type { ReactNode } from "react";
import { spacing } from "../../design/tokens";

export function KpiStrip({ children }: { children: ReactNode }) {
  return <div className="flex w-full flex-wrap" style={{ gap: spacing.kpiCardGap }}>{children}</div>;
}
