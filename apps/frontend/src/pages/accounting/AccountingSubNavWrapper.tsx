import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Button } from "../../components/Button";
import { NavyPageSubNav } from "../../components/layout/NavyPageSubNav";
import { ACCOUNTING_SUB_NAV_ITEMS } from "./subnav-manifest";
import { hasInAppHistory } from "../../lib/smart-back";

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
}: Props) {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const [createMenuOpen, setCreateMenuOpen] = useState(false);
  const createMenuRef = useRef<HTMLDivElement | null>(null);

  const activeHref = useMemo(() => activeHrefFor(pathname), [pathname]);
  void activeHref;

  useEffect(() => {
    const onDown = (event: MouseEvent) => {
      if (!createMenuRef.current?.contains(event.target as Node)) setCreateMenuOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  return (
    <div className="space-y-4" data-accounting-subnav-wrapper="true">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-2">
          <button
            type="button"
            aria-label="Back"
            onClick={() => {
              if (hasInAppHistory(window.history.state)) {
                navigate(-1);
                return;
              }
              navigate("/home");
            }}
            className="mt-0.5 inline-flex items-center gap-1 rounded-xs border-0 bg-transparent px-1 py-0.5 text-[11px] font-semibold text-gray-600 hover:bg-gray-100 hover:text-gray-900"
          >
            <span aria-hidden>←</span>
            <span>Back</span>
          </button>
          <div>
            <h1 className="text-xl font-semibold text-gray-900">{title}</h1>
            {subtitle ? <p className="text-sm text-gray-600">{subtitle}</p> : null}
          </div>
        </div>
        {/*
          ACCT-CHROME-UNIFORM-01 — one toolbar scale (Button md = h-8 / text-[13px]):
          [non-create actions] · Go to vendors · ONE create control.
        */}
        <div className="flex flex-wrap items-center gap-2" data-accounting-toolbar="true">
          {actions}
          <Link
            to="/vendors"
            className="inline-flex h-8 items-center rounded-sm border border-gray-300 bg-white px-3 text-[13px] font-medium text-[#0F1219] hover:bg-gray-50"
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
                      className="block border-b border-gray-100 px-3 py-2 text-[13px] text-gray-800 hover:bg-gray-50 last:border-b-0"
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
        <NavyPageSubNav
          items={ACCOUNTING_SUB_NAV_ITEMS.map((item) => ({
            label: item.label,
            to: item.href ?? "",
            children: item.children?.map((c) => ({ label: c.label, to: c.href })),
          }))}
        />
      </div>

      {kpiStrip}

      {children}
    </div>
  );
}
