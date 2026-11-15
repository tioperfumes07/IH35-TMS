import { useMemo, type ReactNode } from "react";
import { useLocation, useSearchParams } from "react-router-dom";
import { PageHeader } from "../../components/forms/shared/PageHeader";
import { NavyPageSubNav } from "../../components/layout/NavyPageSubNav";
import { resolveBackHref } from "../../lib/returnContext";
import { V3 } from "../../design/v3-tokens";

type SubNavItem = { label: string; to: string };

/**
 * ROUND 9.4 Board 18 — Factoring chrome identical to docs/design/v3/Factoring.dc.html:
 * PageHeader variant="v3" + NavyPageSubNav (replaces HoverDropdownNav / BackButton layer).
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
  const structuralParent = "/factoring";
  const resolvedBack = resolveBackHref({ searchParams, pathname, fallback: structuralParent });

  const navItems = useMemo(
    () => subnavItems.map((item) => ({ label: item.label, to: item.to })),
    [subnavItems],
  );

  return (
    <>
      <PageHeader
        variant="v3"
        crumb="Factoring"
        backHref={resolvedBack}
        title={title}
        subtitle={subtitle}
        actions={actions}
      />
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
