import type { ReactNode } from "react";
import { spacing } from "../../design/tokens";

export function SubAreaGrid({ children }: { children: ReactNode }) {
  return (
    <div
      className="grid grid-cols-2 lg:grid-cols-4"
      style={{ gap: spacing.subAreaTileGap }}
    >
      {children}
    </div>
  );
}
