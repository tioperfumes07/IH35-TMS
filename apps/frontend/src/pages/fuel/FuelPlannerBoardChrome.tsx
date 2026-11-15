import { useMemo, type ReactNode } from "react";
import { useLocation, useSearchParams } from "react-router-dom";
import { PageHeader } from "../../components/forms/shared/PageHeader";
import { NavyPageSubNav } from "../../components/layout/NavyPageSubNav";
import { resolveBackHref } from "../../lib/returnContext";
import { V3 } from "../../design/v3-tokens";

type SubNavItem = { label: string; to: string };

/**
 * ROUND 9.4 Board 19 — Fuel chrome identical to docs/design/v3/Fuel.dc.html:
 * PageHeader variant="v3" + NavyPageSubNav (REPLACE BackButton/Breadcrumb/HoverDropdownNav).
 */
export function FuelPlannerBoardChrome({
  title,
  subtitle,
  backHref,
  actions,
  subnavItems,
}: {
  title: string;
  subtitle: string;
  backHref?: string;
  actions?: ReactNode;
  subnavItems: SubNavItem[];
}) {
  const { pathname } = useLocation();
  const [searchParams] = useSearchParams();
  const structuralParent = backHref ?? "/fuel";
  const resolvedBack = resolveBackHref({ searchParams, pathname, fallback: structuralParent });

  const navItems = useMemo(
    () => subnavItems.map((item) => ({ label: item.label, to: item.to })),
    [subnavItems],
  );

  return (
    <>
      <PageHeader
        variant="v3"
        crumb="Fuel"
        backHref={resolvedBack}
        title={title}
        subtitle={subtitle}
        actions={actions}
      />
      <div
        data-fuel-board-chrome="1"
        data-testid="fuel-board-chrome"
        style={{ marginTop: 4, lineHeight: "normal", fontFamily: V3.font, color: V3.ink }}
      >
        <div data-testid="fuel-board-tabs">
          <NavyPageSubNav items={navItems} />
        </div>
      </div>
    </>
  );
}
