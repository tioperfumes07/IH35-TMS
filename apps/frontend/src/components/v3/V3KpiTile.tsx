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
}) {
  const Tag = onClick ? "button" : "div";
  const tooltip = title ?? (noDrill ? `${label} — ${noDrill}` : label);
  const style: CSSProperties = {
    background: V3.surface,
    border: `1px solid ${V3.border}`,
    borderRadius: 2,
    padding: "10px 12px",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-end",
    gap: 8,
    minWidth: 0,
    textAlign: "left",
    width: "100%",
    cursor: onClick || href ? "pointer" : undefined,
    textDecoration: "none",
    color: "inherit",
    fontFamily: V3.font,
  };

  const body = (
    <>
      <div style={{ display: "flex", flexDirection: "column", gap: 3, minWidth: 0 }}>
        <span
          style={{
            fontSize: V3_KPI.labelPx,
            fontWeight: 600,
            letterSpacing: "0.06em",
            color: V3.muted,
            textTransform: "uppercase",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {label}
        </span>
        <span
          className="n"
          style={{
            fontSize: V3_KPI.valuePx,
            fontWeight: 700,
            color: TONE[tone],
            fontVariantNumeric: "tabular-nums",
            whiteSpace: "nowrap",
          }}
        >
          {value}
        </span>
        {sub != null && sub !== "" && (
          <span
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
