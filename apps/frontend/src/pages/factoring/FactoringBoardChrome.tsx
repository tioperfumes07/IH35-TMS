import { useMemo, type ReactNode } from "react";
import { useLocation, useSearchParams } from "react-router-dom";
import { HoverDropdownNav, type NavItem } from "../../components/forms/shared/HoverDropdownNav";
import { BackButton } from "../../components/shared/BackButton";
import { Breadcrumb } from "../../components/shared/Breadcrumb";
import { resolveBackHref } from "../../lib/returnContext";

type SubNavItem = { label: string; to: string };

function activeHrefFor(pathname: string, search: string, items: SubNavItem[]): string | undefined {
  const full = `${pathname}${search}`;
  const matches = items
    .map((item) => item.to)
    .filter((to) => {
      if (to.includes("?")) return full === to || full.startsWith(`${to}&`);
      return pathname === to || pathname.startsWith(`${to}/`);
    });
  if (matches.length === 0) return undefined;
  return matches.reduce((best, href) => (href.length > best.length ? href : best));
}

/**
 * ROUND 443.326 — Factoring module chrome matching FuelPlannerBoardChrome /
 * SettlementsSubNavWrapper: breadcrumb + title + HoverDropdownNav.
 * ROUND 8.17 — BackButton + breadcrumb consume `ret` (fee→advance reverse restore).
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
  const { pathname, search } = useLocation();
  const [searchParams] = useSearchParams();
  const structuralParent = "/factoring";
  const resolvedBack = resolveBackHref({ searchParams, pathname, fallback: structuralParent });
  const showBack = pathname !== "/factoring" || resolvedBack !== structuralParent;
  const breadcrumb = showBack
    ? [{ label: "Factoring", href: resolvedBack }, { label: title }]
    : [{ label: title }];

  const navItems = useMemo<NavItem[]>(
    () => subnavItems.map((item) => ({ label: item.label, href: item.to })),
    [subnavItems],
  );
  const activeHref = useMemo(
    () => activeHrefFor(pathname, search, subnavItems),
    [pathname, search, subnavItems],
  );

  return (
    <div className="space-y-3" data-factoring-board-chrome="1" data-testid="factoring-board-chrome">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          {showBack ? (
            <div data-testid="factoring-board-back">
              <BackButton fallbackTo={structuralParent} />
            </div>
          ) : null}
          <div data-testid="factoring-breadcrumb">
            <Breadcrumb items={breadcrumb} />
          </div>
          <h1 className="text-page-title font-semibold text-gray-900">{title}</h1>
          {subtitle ? <p className="text-xs text-gray-600">{subtitle}</p> : null}
        </div>
        <div className="flex flex-wrap items-center gap-2" data-factoring-toolbar="true">
          {actions}
        </div>
      </div>
      <div className="relative z-10">
        {nav ?? <HoverDropdownNav items={navItems} activeHref={activeHref} openOn="click" />}
      </div>
    </div>
  );
}
