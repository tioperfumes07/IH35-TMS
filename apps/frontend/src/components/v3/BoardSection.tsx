/**
 * ROUND 443.326 — bordered board section (replaces V3Panel on Settlements/Fuel boards).
 * Same visual: 1px border, 2px radius, title row, optional View all.
 * ROUND 8.20 Class R — prefer viewAllHref (shareable Link) over onViewAll onClick-only.
 */
import type { CSSProperties, ReactNode } from "react";
import { Link } from "react-router-dom";
import { V3 } from "../../design/v3-tokens";

const viewAllStyle: CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  color: V3.link,
  background: "transparent",
  border: "none",
  cursor: "pointer",
  padding: 0,
  fontFamily: V3.font,
  textDecoration: "none",
};

export function BoardSection({
  title,
  subtitle,
  onViewAll,
  viewAllHref,
  viewAllLabel = "View all →",
  headerRight,
  footer,
  children,
  testId,
}: {
  title: string;
  subtitle?: string;
  onViewAll?: () => void;
  /** Prefer over onViewAll — shareable drill with ?ret= (Class R). */
  viewAllHref?: string;
  viewAllLabel?: string;
  headerRight?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
  testId?: string;
}) {
  const shell: CSSProperties = {
    background: V3.surface,
    border: `1px solid ${V3.border}`,
    borderRadius: 2,
    display: "flex",
    flexDirection: "column",
    minWidth: 0,
    fontFamily: V3.font,
  };
  return (
    <section style={shell} data-testid={testId}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 10,
          padding: "10px 14px",
          borderBottom: `1px solid ${V3.borderSoft}`,
        }}
      >
        <div style={{ display: "flex", alignItems: "baseline", gap: 8, minWidth: 0 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: V3.ink, fontFamily: V3.font }}>{title}</span>
          {subtitle ? <span style={{ fontSize: 12, color: V3.muted }}>{subtitle}</span> : null}
        </div>
        <span style={{ display: "flex", gap: 8, alignItems: "center", flexShrink: 0 }}>
          {headerRight}
          {viewAllHref ? (
            <Link to={viewAllHref} style={viewAllStyle} data-testid={testId ? `${testId}-view-all` : undefined}>
              {viewAllLabel}
            </Link>
          ) : onViewAll ? (
            <button type="button" onClick={onViewAll} style={viewAllStyle}>
              {viewAllLabel}
            </button>
          ) : null}
        </span>
      </div>
      <div style={{ minWidth: 0 }}>{children}</div>
      {footer != null ? (
        <div
          style={{
            padding: "8px 14px",
            borderTop: `1px solid ${V3.borderSoft}`,
            fontSize: 12,
            color: V3.muted,
            fontFamily: V3.font,
          }}
        >
          {footer}
        </div>
      ) : null}
    </section>
  );
}
