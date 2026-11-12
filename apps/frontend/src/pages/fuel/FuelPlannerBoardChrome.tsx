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
 * ROUND 443.326 — Fuel module chrome matching SettlementsSubNavWrapper:
 * breadcrumb + title + HoverDropdownNav. Replaces PageHeader + NavyPageSubNav extract theater.
 * ROUND 8.17 — BackButton + breadcrumb Fuel link consume `ret` (History reverse from By-truck).
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
  const { pathname, search } = useLocation();
  const [searchParams] = useSearchParams();
  const structuralParent = backHref ?? "/fuel";
  const resolvedBack = resolveBackHref({ searchParams, pathname, fallback: structuralParent });
  // Show Back on History / By-truck / non-home tabs, and whenever `ret` restores a drill origin.
  const showBack = pathname !== "/fuel" || resolvedBack !== structuralParent;
  const breadcrumb =
    showBack
      ? [{ label: "Fuel", href: resolvedBack }, { label: title }]
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
    <div className="space-y-3" data-fuel-board-chrome="1" data-testid="fuel-board-chrome">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          {showBack ? (
            <div data-testid="fuel-board-back">
              <BackButton fallbackTo={structuralParent} />
            </div>
          ) : null}
          <div data-testid="fuel-breadcrumb">
            <Breadcrumb items={breadcrumb} />
          </div>
          <h1 className="text-page-title font-semibold text-gray-900">{title}</h1>
          {subtitle ? <p className="text-xs text-gray-600">{subtitle}</p> : null}
        </div>
        <div className="flex flex-wrap items-center gap-2" data-fuel-toolbar="true">
          {actions}
        </div>
      </div>
      <div className="relative z-10">
        <HoverDropdownNav items={navItems} activeHref={activeHref} openOn="click" />
      </div>
    </div>
  );
}
