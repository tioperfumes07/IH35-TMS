import { colors, spacing, typography } from "../../design/tokens";

type Props = {
  label: string;
  number: string | number;
  accent?: string;
};

export function KpiCard({ label, number, accent }: Props) {
  return (
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
}
