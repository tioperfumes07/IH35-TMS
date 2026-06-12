import { NavLink, useLocation } from "react-router-dom";
import { ACCOUNTING_CLEAN_TABS } from "./subnav-manifest";

function tabActive(pathname: string, to: string): boolean {
  if (to === "/accounting") return pathname === "/accounting";
  return pathname === to || pathname.startsWith(`${to}/`);
}

/** OB1 — unified 12-tab accounting nav. Replaces the legacy 38-item hover-dropdown. */
export function AccountingSubNav() {
  const { pathname } = useLocation();
  return (
    <nav
      className="overflow-x-auto rounded border border-gray-200 bg-white px-2 py-1 mb-4"
      aria-label="Accounting sub-navigation"
      data-testid="accounting-subnav-unified"
    >
      <div className="flex min-w-max gap-1">
        {ACCOUNTING_CLEAN_TABS.map((tab) => {
          const active = tabActive(pathname, tab.to);
          return (
            <NavLink
              key={tab.label}
              to={tab.to}
              className={`rounded px-3 py-1 text-sm whitespace-nowrap ${
                active
                  ? "border-b-2 border-sky-600 bg-gray-100 font-semibold text-gray-900"
                  : "text-gray-700 hover:bg-gray-50"
              }`}
            >
              {tab.label}
            </NavLink>
          );
        })}
      </div>
    </nav>
  );
}
