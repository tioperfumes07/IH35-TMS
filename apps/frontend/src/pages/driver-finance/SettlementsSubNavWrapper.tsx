import { useMemo, type ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { HoverDropdownNav, type NavItem } from "../../components/forms/shared/HoverDropdownNav";
import { Breadcrumb } from "../../components/shared/Breadcrumb";
import { SETTLEMENTS_SUBNAV } from "./settlementsSubnav";

type Props = {
  title?: string;
  subtitle?: string;
  actions?: ReactNode;
  createControl?: ReactNode;
  children: ReactNode;
  kpiStrip?: ReactNode;
  crumbs?: Array<{ label: string; href: string }>;
};

function activeHrefFor(pathname: string, search: string): string | undefined {
  const full = `${pathname}${search}`;
  const leaves = SETTLEMENTS_SUBNAV.map((item) => item.to);
  const matches = leaves.filter((to) => {
    if (to.includes("?")) return full === to || full.startsWith(`${to}&`);
    return pathname === to || pathname.startsWith(`${to}/`);
  });
  if (matches.length === 0) return undefined;
  return matches.reduce((best, href) => (href.length > best.length ? href : best));
}

/**
 * ROUND 443.326 — Settlements module chrome matching AccountingSubNavWrapper:
 * breadcrumb + title + createControl + HoverDropdownNav + kpiStrip. Replaces PageHeader + NavyPageSubNav.
 */
export function SettlementsSubNavWrapper({
  title = "Settlements",
  subtitle,
  actions,
  createControl,
  children,
  kpiStrip,
  crumbs,
}: Props) {
  const { pathname, search } = useLocation();
  const breadcrumb =
    pathname === "/driver-finance/settlements" && !search
      ? [{ label: "Settlements" }]
      : [{ label: "Settlements", href: "/driver-finance/settlements" }, ...(crumbs ?? []), { label: title }];

  const navItems = useMemo<NavItem[]>(
    () => SETTLEMENTS_SUBNAV.map((item) => ({ label: item.label, href: item.to })),
    [],
  );
  const activeHref = useMemo(() => activeHrefFor(pathname, search), [pathname, search]);

  return (
    <div className="space-y-4" data-settlements-subnav-wrapper="true">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div data-testid="settlements-breadcrumb">
            <Breadcrumb items={breadcrumb} />
          </div>
          <h1 className="text-page-title font-semibold text-gray-900">{title}</h1>
          {subtitle ? <p className="text-xs text-gray-600">{subtitle}</p> : null}
        </div>
        <div className="flex flex-wrap items-center gap-2" data-settlements-toolbar="true">
          {actions}
          {createControl}
        </div>
      </div>

      <div className="relative z-10">
        <HoverDropdownNav items={navItems} activeHref={activeHref} openOn="click" />
      </div>

      {kpiStrip}

      {children}
    </div>
  );
}
