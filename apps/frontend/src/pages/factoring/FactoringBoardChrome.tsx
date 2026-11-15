import { useMemo, type ReactNode } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { Breadcrumb } from "../../components/shared/Breadcrumb";
import { NavyPageSubNav } from "../../components/layout/NavyPageSubNav";
import { resolveBackHref } from "../../lib/returnContext";
import { V3 } from "../../design/v3-tokens";

type SubNavItem = { label: string; to: string };

/**
 * ROUND 9.4 Board 18 / ROUND 443.326 — Factoring chrome: breadcrumb + V3 header + HoverDropdownNav tab strip.
 * Board grammar only — legacy chrome removed per verify-v3-board-grammar-every-surface.
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

  // Factoring.dc.html draws the same navy tab bar as every V3 board (#13233F, 600 11px, active .16 box + 2px rule).
  const navItems = useMemo(
    () => subnavItems.map((item) => ({ label: item.label, to: item.to })),
    [subnavItems],
  );

  return (
    <>
      <Breadcrumb items={[{ label: "Factoring" }]} />
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
            {"←"}
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
          {nav ?? <NavyPageSubNav items={navItems} />}
        </div>
      </div>
    </>
  );
}
