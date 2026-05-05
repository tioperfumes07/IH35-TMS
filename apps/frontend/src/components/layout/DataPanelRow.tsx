import type { ReactNode } from "react";
import { colors, spacing, typography } from "../../design/tokens";

export function DataPanelRow({ children }: { children: ReactNode }) {
  return (
    <div
      className="flex items-center justify-between border-b last:border-b-0"
      style={{
        minHeight: spacing.panelDataRowHeight,
        borderBottomColor: colors.cardBorder,
        fontSize: typography.bodyTextSmall,
      }}
    >
      {children}
    </div>
  );
}
