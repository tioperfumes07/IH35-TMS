import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import { HoverDropdownNav, type NavItem } from "../../components/forms/shared/HoverDropdownNav";
import { ACCOUNTING_SUB_NAV_ITEMS } from "./subnav-manifest";

const CREATE_MENU = [
  { label: "New Bill", to: "/accounting/bills/vendor" },
  { label: "Expense", to: "/accounting/expenses" },
  { label: "Invoice", to: "/accounting/invoices" },
  { label: "Receive payment", to: "/accounting/payments" },
  { label: "Journal entry", to: "/accounting/journal-entries" },
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

/** All leaf hrefs (top-level leaves + every group child) from the grouped nav model. */
function leafHrefs(items: readonly NavItem[]): string[] {
  const out: string[] = [];
  for (const item of items) {
    if (item.href) out.push(item.href);
    for (const child of item.children ?? []) out.push(child.href);
  }
  return out;
}

/** Pick the most-specific (longest) leaf href that is active for the current path. */
function activeHrefFor(pathname: string): string | undefined {
  const matches = leafHrefs(ACCOUNTING_SUB_NAV_ITEMS).filter((href) => tabActive(pathname, href));
  if (matches.length === 0) return undefined;
  return matches.reduce((best, href) => (href.length > best.length ? href : best));
}

export function AccountingSubNavWrapper({ title = "Accounting", subtitle, actions, children, kpiStrip }: Props) {
  const { pathname } = useLocation();
  const [createMenuOpen, setCreateMenuOpen] = useState(false);
  const createMenuRef = useRef<HTMLDivElement | null>(null);

  const activeHref = useMemo(() => activeHrefFor(pathname), [pathname]);

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
        <div>
          <h1 className="text-xl font-semibold text-gray-900">{title}</h1>
          {subtitle ? <p className="text-sm text-gray-600">{subtitle}</p> : null}
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
        Approved grouped click-open sub-nav (docs/approved-screens/3-Accounting-Dropdown.png).
        Groups open on CLICK and stay open until an item is chosen / outside-click / Escape (NOT hover) —
        LOCKED per docs/specs/NAVIGATION-PATTERN-RULE.md. Sourced from ACCOUNTING_SUB_NAV_ITEMS.
      */}
      {/* No overflow-x-auto here: it clips absolute .nav-dropdown menus (Safety hotfix class of bug). */}
      <div className="relative z-10">
        <HoverDropdownNav items={[...ACCOUNTING_SUB_NAV_ITEMS]} activeHref={activeHref} openOn="click" />
      </div>

      {kpiStrip}

      {children}
    </div>
  );
}
