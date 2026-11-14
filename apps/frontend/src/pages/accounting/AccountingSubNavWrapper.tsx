import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import { Button } from "../../components/Button";
import { Breadcrumb } from "../../components/shared/Breadcrumb";
import { HoverDropdownNav } from "../../components/forms/shared/HoverDropdownNav";
import { ACCOUNTING_SUB_NAV_ITEMS } from "./subnav-manifest";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { useAccountingNavKpis } from "./useAccountingNavKpis";
import { resolveBackHref } from "../../lib/returnContext";
import "../../assets/fonts/v3-maintenance/board-box.css";
import "../../assets/fonts/v3-maintenance/fonts.css";

// ACCT-F6322 — hub + Create ▾ must open the same ?create=1 wizards as Topbar
// (ACCT-F5053–5056). Bare list hrefs are silent no-ops when already on that list.
const CREATE_MENU = [
  { label: "New Bill", to: "/accounting/bills/vendor" },
  { label: "Expense", to: "/accounting/expenses?create=1" },
  { label: "Invoice", to: "/accounting/invoices?create=1" },
  { label: "Receive payment", to: "/accounting/payments?create=1" },
  { label: "Journal entry", to: "/accounting/journal-entries?create=1" },
] as const;

type Props = {
  title?: string;
  subtitle?: string;
  /**
   * Non-create toolbar extras (nav shortcuts, filters). Do NOT put a second + Create here —
   * use `createControl` so the surface has exactly one create control.
   */
  actions?: ReactNode;
  /**
   * Surface-specific create CTA. When set, replaces the module "+ Create ▾" menu so Bills /
   * Invoices / Expenses / Payments each show ONE create control at the shared button scale.
   */
  createControl?: ReactNode;
  children: ReactNode;
  kpiStrip?: ReactNode;
  /**
   * U18 (owner UI register 2026-10-03) — "Back is browser history — becomes a breadcrumb, parent always the module home".
   * Optional parents between Accounting and this page (e.g. Bills for a recurring bill); Accounting is always first.
   */
  crumbs?: Array<{ label: string; href: string }>;
};

/** True when `to` is the active tab for `pathname` (exact, or a nested detail route under it). */
function tabActive(pathname: string, to: string): boolean {
  if (to === "/accounting") return pathname === "/accounting";
  if (to === "/accounting/bills") return pathname === "/accounting/bills" || pathname.startsWith("/accounting/bills/");
  return pathname === to || pathname.startsWith(`${to}/`);
}

/** All leaf hrefs from the grouped nav model (NavItem shape: href + children[].href). */
function leafHrefsFromNav(items: readonly { href?: string; children?: readonly { href: string }[] }[]): string[] {
  const out: string[] = [];
  for (const item of items) {
    if (item.href) out.push(item.href);
    for (const child of item.children ?? []) out.push(child.href);
  }
  return out;
}

/** Pick the most-specific (longest) leaf href that is active for the current path. */
function activeHrefFor(pathname: string): string | undefined {
  const matches = leafHrefsFromNav(ACCOUNTING_SUB_NAV_ITEMS).filter((href) => tabActive(pathname, href));
  if (matches.length === 0) return undefined;
  return matches.reduce((best, href) => (href.length > best.length ? href : best));
}

export function AccountingSubNavWrapper({
  title = "Accounting",
  subtitle,
  actions,
  createControl,
  children,
  kpiStrip,
  crumbs,
}: Props) {
  const { pathname } = useLocation();
  const [searchParams] = useSearchParams();
  // ROUND 9.1 board1 v3parity — hub Back uses ?ret= return context, fallback /accounting.
  const accountingBackHref = resolveBackHref({
    searchParams,
    pathname,
    fallback: "/accounting",
  });
  // U18 — breadcrumb: Accounting home › [parent crumbs] › page title
  const breadcrumb = [
    { label: "Accounting", href: accountingBackHref },
    ...(crumbs ?? []),
    { label: title },
  ];
  const [createMenuOpen, setCreateMenuOpen] = useState(false);
  const createMenuRef = useRef<HTMLDivElement | null>(null);
  const { selectedCompanyId } = useCompanyContext();
  const navKpis = useAccountingNavKpis(selectedCompanyId);

  const activeHref = useMemo(() => activeHrefFor(pathname), [pathname]);

  // ALL-SEATS RESEARCH-BEHAVIOR (2026-09-13, McLeod) — "money lives in the navigation": count +
  // dollar total in the tab label, e.g. "Bills (27) $271,280.41". Text-only change on the two
  // group labels that carry an open-balance concept (Bills, Invoices) — every other label, the
  // dropdown children, and all styling are untouched.
  const navItems = useMemo(() => {
    return ACCOUNTING_SUB_NAV_ITEMS.map((item) => {
      // Design parity (R9.0 Board 1): Bills = plain label; Invoices = count only, no dollar amount.
      if (item.label === "Invoices" && navKpis.invoices.count > 0) {
        return { ...item, label: `Invoices (${navKpis.invoices.count})` };
      }
      return item;
    });
  }, [navKpis]);

  useEffect(() => {
    const onDown = (event: MouseEvent) => {
      if (!createMenuRef.current?.contains(event.target as Node)) setCreateMenuOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  return (
    // R9.1 board1 v3parity — data-v3-board scopes board-box.css; lineHeight overrides app 1.5 default.
    <div data-v3-board="Accounting" data-accounting-subnav-wrapper="true" style={{ lineHeight: "normal" }}>
      {/* U18 guard — Accounting breadcrumb nav; Breadcrumb claims the breadcrumb slot */}
      <Breadcrumb items={breadcrumb} />

      {/* Header row matches design: ← Back · title · subtitle | Go to vendors · create */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginTop: 12, gap: 12, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
          {/* "← Back" navigation — spec key fontSize=11px color=#5B6576 */}
          <Link to={accountingBackHref} style={{ fontSize: 11, color: "#5B6576", textDecoration: "none" }}>← Back</Link>
          <h1 className="m-0" style={{ fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif", fontSize: 18, fontWeight: 700 }}>{title}</h1>
          {subtitle ? <span style={{ fontSize: 11, color: "#5B6576" }}>{subtitle}</span> : null}
        </div>
        {/* Go to vendors (11px/600/#111827) + create control */}
        <div style={{ display: "flex", gap: 12, alignItems: "center" }} data-accounting-toolbar="true">
          {actions}
          <Link
            to="/vendors"
            style={{ fontSize: 11, fontWeight: 600, color: "#111827", textDecoration: "none" }}
          >
            Go to vendors
          </Link>
          {createControl ? (
            createControl
          ) : (
            <div ref={createMenuRef} className="relative">
              <Button type="button" onClick={() => setCreateMenuOpen((open) => !open)}>
                + Create ▾
              </Button>
              {createMenuOpen ? (
                <div className="absolute right-0 z-20 mt-1 min-w-[180px] rounded-sm border border-gray-200 bg-white shadow-md">
                  {CREATE_MENU.map((item) => (
                    <Link
                      key={item.label}
                      to={item.to}
                      onClick={() => setCreateMenuOpen(false)}
                      className="block border-b border-gray-100 px-3 py-2 text-xs text-gray-800 hover:bg-gray-50 last:border-b-0"
                    >
                      {item.label}
                    </Link>
                  ))}
                </div>
              ) : null}
            </div>
          )}
        </div>
      </div>

      <div className="relative z-10">
        <HoverDropdownNav items={navItems} activeHref={activeHref} openOn="click" hideChevron uppercase />
      </div>

      {kpiStrip}

      {children}
    </div>
  );
}
