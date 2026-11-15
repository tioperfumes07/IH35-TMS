import { useMemo, type ReactNode } from "react";
import { NavLink, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { resolveBackHref } from "../../lib/returnContext";
import { V3 } from "../../design/v3-tokens";

type SubNavItem = { label: string; to: string };

/**
 * ROUND 9.4 Board 18 / ROUND 443.326 — Factoring chrome: breadcrumb + V3 header + tab strip.
 * Uses inline header + NavLink tab strip (board grammar only — legacy chrome removed).
 */
export function FactoringBoardChrome({
  title,
  subtitle,
  actions,
  subnavItems = [],
  nav,
}: {
  title: string;
  subtitle: string;
  actions?: ReactNode;
  subnavItems?: SubNavItem[];
  nav?: ReactNode;
}) {
  const { pathname } = useLocation();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const structuralParent = "/factoring";
  const resolvedBack = resolveBackHref({ searchParams, pathname, fallback: structuralParent });

  const navItems = useMemo(
    () => subnavItems.map((item) => ({ label: item.label, to: item.to })),
    [subnavItems],
  );

  return (
    <>
      <div
        data-testid="page-header-v3"
        style={{ fontSize: 11, color: V3.muted, fontFamily: V3.font, lineHeight: "normal" }}
      >
        Factoring
      </div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-end",
          marginTop: 12,
          gap: 12,
          flexWrap: "wrap",
          fontFamily: V3.font,
          lineHeight: "normal",
          color: V3.ink,
        }}
      >
        <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
          <button
            type="button"
            aria-label="Back"
            data-testid="page-header-back"
            onClick={() => void navigate(resolvedBack)}
            style={{
              fontSize: 11,
              color: V3.muted,
              background: "none",
              border: "none",
              padding: 0,
              cursor: "pointer",
              fontFamily: V3.font,
              lineHeight: "normal",
            }}
          >
            ← Back
          </button>
          <h1 style={{ margin: 0, font: `700 18px ${V3.font}`, color: V3.ink, lineHeight: "normal", height: 22 }}>
            {title}
          </h1>
          {subtitle ? (
            <span style={{ fontSize: 11, color: V3.muted, lineHeight: "normal" }}>{subtitle}</span>
          ) : null}
        </div>
        {actions ? (
          <div style={{ display: "flex", gap: 12, alignItems: "center", font: `600 11px ${V3.font}` }}>
            {actions}
          </div>
        ) : null}
      </div>
      <div
        data-factoring-board-chrome="1"
        data-testid="factoring-board-chrome"
        style={{ marginTop: 4, lineHeight: "normal", fontFamily: V3.font, color: V3.ink }}
        data-factoring-board-tabs-wrap="1"
      >
        <div data-testid="factoring-board-tabs">
          {nav ?? (
            <nav style={{ display: "flex", gap: 2 }}>
              {navItems.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  style={({ isActive }) => ({
                    padding: "6px 12px",
                    fontSize: 12,
                    fontWeight: isActive ? 600 : 400,
                    color: V3.ink,
                    background: isActive ? V3.surface : "transparent",
                    border: `1px solid ${isActive ? V3.border : "transparent"}`,
                    borderRadius: 2,
                    textDecoration: "none",
                    lineHeight: "normal",
                  })}
                >
                  {item.label}
                </NavLink>
              ))}
            </nav>
          )}
        </div>
      </div>
    </>
  );
}
