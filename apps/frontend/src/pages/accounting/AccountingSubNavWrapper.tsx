import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import { ACCOUNTING_CLEAN_TABS, ACCOUNTING_MORE_TABS } from "./subnav-manifest";

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

function tabActive(pathname: string, to: string): boolean {
  if (to === "/accounting") return pathname === "/accounting";
  if (to === "/accounting/bills") return pathname === "/accounting/bills" || pathname.startsWith("/accounting/bills/");
  return pathname === to || pathname.startsWith(`${to}/`);
}

export function AccountingSubNavWrapper({ title = "Accounting", subtitle, actions, children, kpiStrip }: Props) {
  const { pathname } = useLocation();
  const [createMenuOpen, setCreateMenuOpen] = useState(false);
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const createMenuRef = useRef<HTMLDivElement | null>(null);
  const moreMenuRef = useRef<HTMLDivElement | null>(null);

  const moreActive = ACCOUNTING_MORE_TABS.some((t) => pathname === t.to || pathname.startsWith(`${t.to}/`));

  useEffect(() => {
    const onDown = (event: MouseEvent) => {
      if (!createMenuRef.current?.contains(event.target as Node)) setCreateMenuOpen(false);
      if (!moreMenuRef.current?.contains(event.target as Node)) setMoreMenuOpen(false);
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
          <Link
            to="/vendors"
            className="rounded border border-gray-300 bg-white px-3 py-1 text-sm font-medium text-gray-800 hover:bg-gray-50"
          >
            + Vendor
          </Link>
          <div ref={createMenuRef} className="relative">
            <button
              type="button"
              onClick={() => setCreateMenuOpen((open) => !open)}
              className="rounded border border-emerald-700 bg-emerald-700 px-3 py-1 text-sm font-semibold text-white hover:bg-emerald-800"
            >
              + Create ▾
            </button>
            {createMenuOpen ? (
              <div className="absolute right-0 z-20 mt-1 min-w-[180px] rounded border border-gray-200 bg-white shadow-md">
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

      <nav className="overflow-x-auto rounded border border-gray-200 bg-white px-2 py-1" aria-label="Accounting sub-navigation">
        <div className="flex min-w-max gap-1">
          {ACCOUNTING_CLEAN_TABS.map((tab) => {
            const active = tabActive(pathname, tab.to);
            return (
              <NavLink
                key={tab.label}
                to={tab.to}
                className={`rounded px-3 py-1 text-sm whitespace-nowrap ${
                  active ? "border-b-2 border-slate-300 bg-gray-100 font-semibold text-gray-900" : "text-gray-700 hover:bg-gray-50"
                }`}
              >
                {tab.label}
              </NavLink>
            );
          })}
          <div ref={moreMenuRef} className="relative">
            <button
              type="button"
              onClick={() => setMoreMenuOpen((o) => !o)}
              className={`rounded px-3 py-1 text-sm whitespace-nowrap ${
                moreActive ? "border-b-2 border-slate-300 bg-gray-100 font-semibold text-gray-900" : "text-gray-700 hover:bg-gray-50"
              }`}
            >
              More ▾
            </button>
            {moreMenuOpen ? (
              <div className="absolute left-0 top-full z-20 mt-1 min-w-[200px] rounded border border-gray-200 bg-white shadow-md">
                {ACCOUNTING_MORE_TABS.map((item) => (
                  <NavLink
                    key={item.label}
                    to={item.to}
                    onClick={() => setMoreMenuOpen(false)}
                    className={({ isActive }) =>
                      `block border-b border-gray-100 px-3 py-2 text-sm last:border-b-0 ${
                        isActive ? "bg-gray-100 font-semibold text-gray-900" : "text-gray-800 hover:bg-gray-50"
                      }`
                    }
                  >
                    {item.label}
                  </NavLink>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      </nav>

      {kpiStrip}

      {children}
    </div>
  );
}
