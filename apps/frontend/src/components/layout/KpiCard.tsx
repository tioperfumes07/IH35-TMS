import { Link } from "react-router-dom";
import { colors, spacing, typography } from "../../design/tokens";
import { NOT_AVAILABLE_YET } from "../../lib/prodEmptyStateCopy";

type Props = {
  label: string;
  number: string | number;
  accent?: string;
  /** When set, the whole KPI card becomes a link to the relevant filtered/detail view
   *  (GLOBAL clickable-KPI behavior — QuickBooks-style drill-down). */
  to?: string;
  /** Local drill-down (same page filter / scroll). Prefer `to` when a real route exists. */
  onClick?: () => void;
  /**
   * Honest non-navigable state — use when NO real destination exists for this metric.
   * Do NOT invent placeholder/nearest-guess routes. Guard: verify-no-dead-clicks.
   */
  disabled?: boolean;
  /** Native tooltip for disabled tiles (defaults to NOT_AVAILABLE_YET). */
  disabledReason?: string;
};

export function KpiCard({ label, number, accent, to, onClick, disabled, disabledReason }: Props) {
  const card = (
    <div
      className="flex min-w-[150px] max-w-full shrink-0 items-center justify-between gap-2 bg-white"
      style={{
        height: spacing.kpiCardHeight,
        paddingLeft: spacing.kpiCardPaddingX,
        paddingRight: spacing.kpiCardPaddingX,
        border: `1px solid ${colors.cardBorder}`,
        borderRadius: spacing.radiusCard,
        borderLeft: accent ? `${spacing.subAreaTileBorderLeft}px solid ${accent}` : `1px solid ${colors.cardBorder}`,
        opacity: disabled ? 0.72 : 1,
      }}
    >
      <span
        className="uppercase"
        style={{ color: colors.mutedText, fontSize: typography.kpiLabel, letterSpacing: typography.looseUpper, fontWeight: 600 }}
      >
        {label}
      </span>
      <span
        className="min-w-0 truncate text-right"
        style={{ color: colors.pageHeading, fontSize: typography.kpiNumber, fontWeight: 700 }}
        title={typeof number === "string" ? number : String(number)}
      >
        {number}
      </span>
    </div>
  );

  if (disabled) {
    return (
      <div
        className="block shrink-0 cursor-not-allowed rounded-sm"
        aria-disabled="true"
        title={disabledReason ?? NOT_AVAILABLE_YET}
        data-kpi-disabled="true"
      >
        {card}
      </div>
    );
  }

  if (to) {
    return (
      <Link to={to} aria-label={`${label} — view details`} className="block shrink-0 rounded-sm transition hover:shadow-xs focus:outline-hidden focus:ring-2 focus:ring-slate-400">
        {card}
      </Link>
    );
  }

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-label={`${label} — view details`}
        className="block w-full shrink-0 rounded-sm text-left transition hover:shadow-xs focus:outline-hidden focus:ring-2 focus:ring-slate-400"
      >
        {card}
      </button>
    );
  }

  return card;
}
