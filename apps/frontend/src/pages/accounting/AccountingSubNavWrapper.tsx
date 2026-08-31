import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
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
  actions?: ReactNode;
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

export function AccountingSubNavWrapper({ title = "Accounting", subtitle, actions, children, kpiStrip }: Props) {
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
          {/*
            UI-BACK-BUTTON-MISSING-ENTIRELY: owner report (2026-08-25) -- "many leafs or tabs are
            missing the back arrow return button." This wrapper is the module header for every one
            of the ~49 routed /accounting/* pages (the whole Accounting module) and had NO back
            control at all -- confirmed by a systemwide route-manifest audit that resolved every
            routed page to its actual rendered header, not just a per-file grep. Same smart-back
            signal as the other three back-button components in this app: prefer true history-based
            back whenever real in-app navigation history exists, falling back to /home (the
            established module-root convention, e.g. SystemModulePage, ComplianceDashboardPage) only
            on a direct URL load/refresh.
          */}
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
        <div className="flex items-center gap-2">
          {actions}
          {/* CLS-CHROME-LAW-8: this is a plain navigation link to /vendors, not a create action —
              "+ " is the app-wide convention for "opens a create flow" (confirmed by every other
              "+ X" button in this app). Relabeled to match the established plain-navigation-link
              convention ("Go to X", see QboStyleHomePage.tsx's "Go to registers"), so it stops
              implying an inline vendor-create flow that doesn't exist here. */}
          <Link
            to="/vendors"
            className="rounded-sm border border-gray-300 bg-white px-3 py-1 text-sm font-medium text-gray-800 hover:bg-gray-50"
          >
            Go to vendors
          </Link>
          <div ref={createMenuRef} className="relative">
            <button
              type="button"
              onClick={() => setCreateMenuOpen((open) => !open)}
              className="rounded-sm border border-[#1f2a44] bg-[#1f2a44] px-3 py-1 text-sm font-semibold text-white hover:bg-[#0f1729]"
            >
              + Create ▾
            </button>
            {createMenuOpen ? (
              <div className="absolute right-0 z-20 mt-1 min-w-[180px] rounded-sm border border-gray-200 bg-white shadow-md">
                {CREATE_MENU.map((item) => (
                  <Link
                    key={item.label}
                    to={item.to}
                    onClick={() => setCreateMenuOpen(false)}
                    className="block border-b border-gray-100 px-3 py-2 text-sm text-gray-800 hover:bg-gray-50 last:border-b-0"
                  >
                    {item.label}
                  </Link>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {/*
        NavyPageSubNav with dropdown children — replaces HoverDropdownNav.
        Groups open on hover with 150ms exit grace (same UX as before).
        Locked tokens: bg-[#1A1F36] text-white text-[11px].
      */}
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
