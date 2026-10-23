/**
 * ROUND 443.250 — shared KPI tile (label 10px caps · value 18px · sub 11px).
 * Colors only from v3-tokens — verify-design-tokens-only scans this folder.
 */
import type { CSSProperties, ReactNode } from "react";
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
  testId,
}: {
  label: string;
  value: string;
  sub?: ReactNode;
  tone?: V3KpiTone;
  spark?: ReactNode;
  title?: string;
  onClick?: () => void;
  testId?: string;
}) {
  const Tag = onClick ? "button" : "div";
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
    cursor: onClick ? "pointer" : undefined,
    fontFamily: V3.font,
  };

  return (
    <Tag type={onClick ? "button" : undefined} onClick={onClick} title={title ?? label} style={style} data-testid={testId}>
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
    </Tag>
  );
}
