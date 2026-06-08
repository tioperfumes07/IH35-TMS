import { NavLink } from "react-router-dom";
import type { ReactNode } from "react";
import { PageHeader } from "../../../components/layout/PageHeader";
import { PlannerRangeProvider } from "./PlannerRangeContext";
import { PlannerRangeToolbar } from "./PlannerRangeToolbar";

const TABS = [
  { label: "Driver Planner", to: "/dispatch/planners/driver" },
  { label: "Truck Planner", to: "/dispatch/planners/truck" },
  { label: "Loads Planner", to: "/dispatch/planners/loads" },
] as const;

export function DispatchPlannersLayout({ children }: { children?: ReactNode }) {
  return (
    <PlannerRangeProvider>
      <div data-testid="dispatch-planners-layout" className="mx-auto max-w-[1400px] space-y-3">
        <PageHeader title="Dispatch Planners" subtitle="Driver leave, truck availability, and load timeline — shared date range" />
        <nav className="flex flex-wrap gap-1 rounded border border-gray-200 bg-white p-1 text-xs">
          {TABS.map((tab) => (
            <NavLink
              key={tab.to}
              to={tab.to}
              className={({ isActive }) =>
                `rounded px-3 py-1.5 font-medium ${isActive ? "bg-slate-800 text-white" : "text-gray-700 hover:bg-gray-100"}`
              }
            >
              {tab.label}
            </NavLink>
          ))}
        </nav>
        <PlannerRangeToolbar />
        {children}
      </div>
    </PlannerRangeProvider>
  );
}
