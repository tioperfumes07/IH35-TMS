import type { ReactNode } from "react";
import { colors, spacing, typography } from "../../design/tokens";

type Variant = "crit" | "warn" | "info" | "positive" | "neutral";

const palette: Record<Variant, { strong: string; soft: string }> = {
  crit: colors.crit,
  warn: colors.warn,
  info: colors.info,
  positive: colors.positive,
  neutral: colors.accounting,
};

export function StatusBadge({ variant, children }: { variant: Variant; children: ReactNode }) {
  const tone = palette[variant];
  return (
    <span
      className="inline-flex items-center px-1.5 py-[2px] font-semibold uppercase"
      style={{
        borderRadius: spacing.radiusPill,
        fontSize: typography.statusBadge,
        backgroundColor: tone.soft,
        color: tone.strong,
      }}
    >
      {children}
    </span>
  );
}
