/**
 * ROUND 9.0 (docs/design/v3/Maintenance-Home.png right column; the same card on other V3 boards): a small board
 * side card — UPPERCASE title, its count right-aligned on the same line, one or a few grey lines underneath.
 * The count links to the full list when `href` is given (route + ?ret built by the caller).
 */
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { V3 } from "../../design/v3-tokens";

export function V3SideCard({ title, count, href, children, testId, countLabel, countTestId }: {
  title: string;
  count: ReactNode;
  href?: string;
  children?: ReactNode;
  testId?: string;
  /** Accessible name for the count link ("PM countdown — view schedules"). */
  countLabel?: string;
  countTestId?: string;
}) {
  const cTestId = countTestId ?? (testId ? `${testId}-count` : undefined);
  return (
    <section data-testid={testId} style={{ background: V3.surface, border: `1px solid ${V3.border}`, borderRadius: 2, padding: "10px 10px", fontFamily: V3.font, minWidth: 0 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
        <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.02em", textTransform: "uppercase", color: V3.ink }}>{title}</span>
        {href ? (
          <Link to={href} aria-label={countLabel} style={{ fontSize: 11, fontWeight: 700, color: V3.ink }} data-testid={cTestId}>{count}</Link>
        ) : (
          <span style={{ fontSize: 11, fontWeight: 700, color: V3.ink }} data-testid={cTestId}>{count}</span>
        )}
      </div>
      {children ? <div style={{ marginTop: 3, fontSize: 11, lineHeight: "15px", color: V3.muted }}>{children}</div> : null}
    </section>
  );
}
