import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { colors, spacing, typography } from "../../design/tokens";

type Props = {
  title: string;
  accentColor?: string;
  viewAllHref?: string;
  children: ReactNode;
};

export function DataPanel({ title, accentColor, viewAllHref, children }: Props) {
  return (
    <section
      className="overflow-hidden bg-white"
      style={{
        border: `1px solid ${colors.cardBorder}`,
        borderTop: `${spacing.panelBorderTop}px solid ${accentColor ?? colors.accounting.strong}`,
        borderRadius: spacing.radiusCard,
      }}
    >
      <header
        className="flex items-center justify-between bg-gray-50"
        style={{ height: spacing.panelHeaderHeight, paddingLeft: spacing.panelPaddingX, paddingRight: spacing.panelPaddingX }}
      >
        <span
          className="uppercase"
          style={{ fontSize: typography.panelHeader, color: colors.mutedText, letterSpacing: typography.tightUpper, fontWeight: 700 }}
        >
          {title}
        </span>
        {viewAllHref ? (
          <Link to={viewAllHref} className="text-[11px] text-slate-700 hover:underline">
            View all →
          </Link>
        ) : null}
      </header>
      <div style={{ padding: `${spacing.panelPaddingY}px ${spacing.panelPaddingX}px` }}>{children}</div>
    </section>
  );
}
