import { colors, spacing, typography } from "../../design/tokens";

type Props = {
  name: string;
  count: number;
  description?: string;
  urgency?: "healthy" | "warn" | "critical";
  domain?: keyof typeof colors;
  onClick?: () => void;
};

function urgencyColor(urgency?: "healthy" | "warn" | "critical") {
  if (urgency === "critical") return colors.crit;
  if (urgency === "warn") return colors.warn;
  return colors.positive;
}

function domainColor(domain?: keyof typeof colors) {
  const value = domain ? (colors[domain] as unknown) : null;
  if (value && typeof value === "object" && "strong" in (value as Record<string, unknown>)) {
    return value as { strong: string; soft: string };
  }
  return null;
}

export function SubAreaTile({ name, count, description, urgency, domain, onClick }: Props) {
  const urgencyPalette = urgencyColor(urgency);
  const domainPalette = domainColor(domain);
  const palette = domainPalette ?? urgencyPalette;

  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full bg-white text-left transition"
      style={{
        height: spacing.subAreaTileHeight,
        padding: spacing.subAreaTilePadding,
        border: `1px solid ${colors.cardBorder}`,
        borderLeft: `${spacing.subAreaTileBorderLeft}px solid ${palette.strong}`,
        borderRadius: spacing.radiusCard,
      }}
      onMouseEnter={(event) => {
        event.currentTarget.style.backgroundColor = palette.soft;
        event.currentTarget.style.borderColor = palette.strong;
      }}
      onMouseLeave={(event) => {
        event.currentTarget.style.backgroundColor = colors.cardBg;
        event.currentTarget.style.borderColor = colors.cardBorder;
      }}
    >
      <div className="flex items-start justify-between">
        <span style={{ fontSize: typography.bodyText, color: colors.bodyText, fontWeight: 500 }}>{name}</span>
        <span
          className="inline-flex items-center rounded px-1.5 py-0.5 font-semibold"
          style={{ fontSize: typography.statusBadge, backgroundColor: palette.soft, color: palette.strong }}
        >
          {count}
        </span>
      </div>
      <div className="truncate" style={{ marginTop: 6, fontSize: typography.bodyTextSmall, color: colors.mutedText }}>
        {description ?? ""}
      </div>
    </button>
  );
}
