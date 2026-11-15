/**
 * ROUND 443.250 — shared KPI tile (label 10px caps · value 18px · sub 11px).
 * Colors only from v3-tokens — verify-design-tokens-only scans this folder.
 */
import type { CSSProperties, ReactNode } from "react";
import { Link } from "react-router-dom";
import { V3, V3_KPI } from "../../design/v3-tokens";

export type V3KpiTone = "ink" | "green" | "red" | "muted" | "amber";

const TONE: Record<V3KpiTone, string> = {
  ink: V3.ink,
  green: V3.green,
  red: V3.red,
  muted: V3.muted,
  amber: V3.amber,
};

export function V3KpiTile({
  label,
  value,
  sub,
  tone = "ink",
  spark,
  title,
  onClick,
  href,
  noDrill,
  testId,
  board = false,
  valueDataV3,
  subDataV3,
}: {
  label: string;
  value: string;
  sub?: ReactNode;
  tone?: V3KpiTone;
  spark?: ReactNode;
  title?: string;
  onClick?: () => void;
  /**
   * The record or filtered list this figure IS (verify-every-graphic-number-clicks-through). A tile renders as a
   * real link, so the number can be opened, bookmarked and shared — not a click handler only the board knows about.
   */
  href?: string;
  /**
   * The stated reason no exact destination exists yet (same contract as MoneyCell drill.none). Shown on hover and
   * counted by the guard — never a silent dead tile.
   */
  noDrill?: string;
  testId?: string;
  /** Draw the V3 board tile (docs/design/v3) instead of the approved Home tile. */
  board?: boolean;
  valueDataV3?: string;
  subDataV3?: string;
}) {
  const Tag = onClick ? "button" : "div";
  const tooltip = title ?? (noDrill ? `${label} — ${noDrill}` : label);
  const style: CSSProperties = {
    background: V3.surface,
    border: `1px solid ${V3.border}`,
    // board: a V3 board's tile (docs/design/v3/*.dc.html, owner 11-14 "100% identical"): 6px corners, height from its
    // content (61px), line-height normal. Without it: the approved Home tile (OWNER DESIGN LAW rule 6, 78px, 2px).
    borderRadius: board ? 6 : 2,
    padding: "10px 12px",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-end",
    gap: 8,
    minWidth: 0,
    ...(board ? { lineHeight: "normal" } : {
      // OWNER DESIGN LAW rule 6 / ROUND 8.4 — KPI tiles are 78px across, never bars down.
      minHeight: V3_KPI.heightPx,
      height: V3_KPI.heightPx,
      boxSizing: "border-box" as const,
    }),
    textAlign: "left",
    width: "100%",
    cursor: onClick || href ? "pointer" : undefined,
    textDecoration: "none",
    color: "inherit",
    fontFamily: V3.font,
  };

  const body = (
    <>
      {/* board tiles: spec min 39px (2-line) or 53px (3-line with sub), docs/design/v3/*.dc.html. */}
      <div style={{ display: "flex", flexDirection: "column", gap: 3, minWidth: 0, ...(board ? { minHeight: 39 } : {}) }}>
        <span
          style={{
            fontSize: V3_KPI.labelPx,
            fontWeight: 600,
            letterSpacing: "0.06em",
            color: V3.muted,
            textTransform: "uppercase",
            ...(board ? { whiteSpace: "normal", textOverflow: "clip" } : { whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }),
          }}
        >
          {label}
        </span>
        <span
          className="n"
          data-v3={valueDataV3}
          style={{
            fontSize: V3_KPI.valuePx,
            fontWeight: 700,
            color: TONE[tone],
            fontVariantNumeric: "tabular-nums",
            whiteSpace: board ? "normal" : "nowrap",
          }}
        >
          {value}
        </span>
        {/* A V3 board always draws the sub line, empty or not (its 3px gap is part of the tile's height). */}
        {(board || (sub != null && sub !== "")) && (
          <span
            data-v3={subDataV3}
            style={{
              fontSize: V3_KPI.subPx,
              color: V3.muted,
              display: "flex",
              gap: 6,
              alignItems: "center",
              whiteSpace: "nowrap",
              overflow: "hidden",
            }}
          >
            {sub}
          </span>
        )}
      </div>
      {spark}
    </>
  );
  if (href) {
    return <Link to={href} title={tooltip} style={style} data-testid={testId}>{body}</Link>;
  }
  return (
    <Tag type={onClick ? "button" : undefined} onClick={onClick} title={tooltip} style={style} data-testid={testId} data-no-drill={noDrill}>
      {body}
    </Tag>
  );
}
