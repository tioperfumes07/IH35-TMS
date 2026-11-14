import { Link } from "react-router-dom";
/**
 * ROUND 443.250 — shared panel (title + optional View all →).
 */
import type { CSSProperties, ReactNode } from "react";
import { V3 } from "../../design/v3-tokens";

export function V3Panel({
  title,
  subtitle,
  viewAllLabel = "View all →",
  onViewAll,
  viewAllHref,
  headerRight,
  children,
  footer,
  testId,
  borderRadius,
  board = false,
  titleDataV3,
}: {
  title: string;
  subtitle?: string;
  viewAllLabel?: string;
  onViewAll?: () => void;
  /** Prefer over onViewAll — shareable drill with ?ret= (Class R). */
  viewAllHref?: string;
  headerRight?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  testId?: string;
  borderRadius?: number;
  /** Draw the V3 board panel (docs/design/v3). */
  board?: boolean;
  /** Parity reader key for a templated title (ROUND 9.4). */
  titleDataV3?: string;
}) {
  const shell: CSSProperties = {
    background: V3.surface,
    border: `1px solid ${V3.border}`,
    // board: a V3 board's panel (docs/design/v3/*.dc.html) — 6px corners, line-height normal.
    borderRadius: borderRadius ?? (board ? 6 : 2),
    ...(board ? { lineHeight: "normal" } : {}),
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
          <span data-v3={titleDataV3} style={{ fontSize: 13, fontWeight: 700, color: V3.ink, lineHeight: "normal" }}>{title}</span>
          {subtitle ? <span style={{ fontSize: 11, color: V3.muted }}>{subtitle}</span> : null}
        </div>
        <span style={{ display: "flex", gap: 8, alignItems: "center", flexShrink: 0 }}>
          {headerRight}
          {viewAllHref ? (
            <Link
              to={viewAllHref}
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: V3.link,
                textDecoration: "none",
                background: "transparent",
                border: "none",
                padding: 0,
                fontFamily: V3.font,
              }}
              data-testid={testId ? `${testId}-view-all` : undefined}
            >
              {viewAllLabel}
            </Link>
          ) : onViewAll ? (
            <button
              type="button"
              onClick={onViewAll}
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: V3.link,
                background: "transparent",
                border: "none",
                cursor: "pointer",
                padding: 0,
                fontFamily: V3.font,
              }}
            >
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
            fontSize: 11,
            color: V3.muted,
          }}
        >
          {footer}
        </div>
      ) : null}
    </section>
  );
}
