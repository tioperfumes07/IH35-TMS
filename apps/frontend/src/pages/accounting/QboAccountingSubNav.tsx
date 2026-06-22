/**
 * C7 — QBO Accounting sub-nav (12 items, exact live order from QBO walkthrough 2026-06-10).
 * Renders as a compact left-rail nav strip; shell items show a "coming soon" badge.
 * ADDITIVE — does not replace AccountingSubNav; used alongside or as alternate view.
 */
import { NavLink } from "react-router-dom";
import { QBO_ACCOUNTING_SUBNAV } from "./subnav-manifest";

export function QboAccountingSubNav() {
  return (
    <nav
      aria-label="Accounting module navigation"
      data-testid="qbo-accounting-subnav"
      className="flex flex-col gap-0.5"
    >
      {QBO_ACCOUNTING_SUBNAV.map((item) => (
        <NavLink
          key={item.path}
          to={item.path}
          className={({ isActive }) =>
            [
              "flex items-center justify-between rounded px-3 py-1.5 text-sm whitespace-nowrap",
              isActive
                ? "bg-slate-100 font-semibold text-slate-700"
                : "text-gray-700 hover:bg-gray-50 hover:text-gray-900",
            ].join(" ")
          }
        >
          <span>{item.label}</span>
          {item.isShell ? (
            <span className="ml-2 rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-400">
              Soon
            </span>
          ) : null}
        </NavLink>
      ))}
    </nav>
  );
}
