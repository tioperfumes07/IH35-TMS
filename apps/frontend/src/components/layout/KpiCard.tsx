import { Link } from "react-router-dom";
import { colors, spacing, typography } from "../../design/tokens";

type Props = {
  label: string;
  number: string | number;
  accent?: string;
  /** When set, the whole KPI card becomes a link to the relevant filtered/detail view
   *  (GLOBAL clickable-KPI behavior — QuickBooks-style drill-down). */
  to?: string;
};

export function KpiCard({ label, number, accent, to }: Props) {
  const card = (
    <div
      className="flex min-w-[150px] flex-1 items-center justify-between bg-white"
      style={{
        height: spacing.kpiCardHeight,
        paddingLeft: spacing.kpiCardPaddingX,
        paddingRight: spacing.kpiCardPaddingX,
        border: `1px solid ${colors.cardBorder}`,
        borderRadius: spacing.radiusCard,
        borderLeft: accent ? `${spacing.subAreaTileBorderLeft}px solid ${accent}` : `1px solid ${colors.cardBorder}`,
      }}
    >
      <span
        className="uppercase"
        style={{ color: colors.mutedText, fontSize: typography.kpiLabel, letterSpacing: typography.looseUpper, fontWeight: 600 }}
      >
        {label}
      </span>
      <span style={{ color: colors.pageHeading, fontSize: typography.kpiNumber, fontWeight: 700 }}>{number}</span>
    </div>
  );

  if (to) {
    return (
      <Link to={to} aria-label={`${label} — view details`} className="block flex-1 rounded transition hover:shadow-sm focus:outline-none focus:ring-2 focus:ring-slate-400">
        {card}
      </Link>
    );
  }
  return card;
}
