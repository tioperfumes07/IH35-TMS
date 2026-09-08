import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { colors, spacing, typography } from "../../design/tokens";

type Props = {
  title: string;
  /** LOAD-COSTS-RETURN-COLS (owner 2026-09-08): "Round-Trip Exposure ... reads as an unexplained
   * number" -- an optional plain-language explainer, shown as a native hover tooltip on the panel
   * title so a KPI/panel whose name alone doesn't say what it counts can say so without a new
   * always-visible UI element. Additive-only: every existing DataPanel caller keeps rendering
   * identically since this prop defaults to none. */
  titleHint?: string;
  accentColor?: string;
  viewAllHref?: string;
  children: ReactNode;
};

export function DataPanel({ title, titleHint, accentColor, viewAllHref, children }: Props) {
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
        {/* GLOBAL-TYPE-SIZE-BASELINE.md (locked): column/section headers are 11px/700/UPPERCASE/
            #4B5563 specifically, not the generic mutedText role — colors.columnHeader is that
            exact locked value, transcribed, not invented. */}
        <span
          className="uppercase"
          style={{ fontSize: typography.panelHeader, color: colors.columnHeader, letterSpacing: typography.tightUpper, fontWeight: 700, cursor: titleHint ? "help" : undefined }}
          title={titleHint}
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
