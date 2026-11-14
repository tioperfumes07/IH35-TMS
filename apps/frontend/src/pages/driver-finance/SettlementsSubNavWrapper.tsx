import { useMemo, type ReactNode } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { HoverDropdownNav, type NavChild, type NavItem } from "../../components/forms/shared/HoverDropdownNav";
import { Breadcrumb } from "../../components/shared/Breadcrumb";
import { resolveBackHref } from "../../lib/returnContext";
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

const PRIMARY_LABELS = new Set([
  "Drivers", "Profiles", "Pre-Settlements", "Settlements",
  "Batch Settlements", "Feed Gate", "Company Settlements",
  "Settlement Close", "Cash Advance Requests", "Cash Advances",
  "Liabilities", "Escrow", "Pay Rate Templates", "Deductions",
]);

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
  title = "Driver Settlements",
  subtitle = "List + detail settlement workflow",
  actions,
  createControl,
  children,
  kpiStrip,
  crumbs,
}: Props) {
  const { pathname, search } = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const backHref = resolveBackHref({ searchParams, pathname, fallback: "/driver-finance" });

  const isRoot = pathname === "/driver-finance/settlements" && !search;
  const breadcrumb = isRoot
    ? [{ label: "Driver Finance", href: "/driver-finance" }, { label: "Settlements" }]
    : [
        { label: "Driver Finance", href: "/driver-finance" },
        { label: "Settlements", href: "/driver-finance/settlements" },
        ...(crumbs ?? []),
        { label: title },
      ];

  const navItems = useMemo<NavItem[]>(() => {
    const primary = SETTLEMENTS_SUBNAV
      .filter((item) => PRIMARY_LABELS.has(item.label))
      .map((item) => ({ label: item.label, href: item.to }));
    const moreChildren: NavChild[] = SETTLEMENTS_SUBNAV
      .filter((item) => !PRIMARY_LABELS.has(item.label))
      .map((item) => ({ label: item.label, href: item.to }));
    return [...primary, { label: "More ▾", children: moreChildren }];
  }, []);
  const activeHref = useMemo(() => activeHrefFor(pathname, search), [pathname, search]);

  return (
    <div className="space-y-4" data-settlements-subnav-wrapper="true">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginTop: 12, gap: 12, flexWrap: "wrap" }}>
        <div>
          <div data-testid="settlements-breadcrumb">
            <Breadcrumb items={breadcrumb} />
          </div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
            <button
              type="button"
              data-testid="settlements-back-btn"
              onClick={() => navigate(backHref)}
              style={{ fontSize: 11, fontWeight: 400, color: "#5B6576", background: "none", border: "none", cursor: "pointer", padding: 0 }}
            >
              ← Back
            </button>
            <span style={{ fontFamily: "Inter, system-ui, sans-serif", fontSize: 18, fontWeight: 700, color: "#111827" }}>{title}</span>
            {subtitle ? (
              <span style={{ fontSize: 11, color: "#5B6576" }}>{subtitle}</span>
            ) : null}
          </div>
        </div>
        <div style={{ display: "flex", gap: 12, alignItems: "center", fontFamily: "Inter, system-ui, sans-serif", font: "600 11px Inter" }} data-settlements-toolbar="true">
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
