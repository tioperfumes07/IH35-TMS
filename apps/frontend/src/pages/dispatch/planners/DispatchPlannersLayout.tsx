import { NavLink } from "react-router-dom";
import type { ReactNode } from "react";
import { useState } from "react";
import { PageHeader } from "../../../components/layout/PageHeader";
import { PlannerRangeProvider } from "./PlannerRangeContext";
import { UniversalFilterBar, type FilterState } from "../../../components/planner/UniversalFilterBar";

const TABS = [
  // Timeline (Phase 1) is the default unified view; the 3 legacy planners stay reachable (archive-not-delete).
  { label: "Timeline", to: "/dispatch/planners/timeline" },
  { label: "Driver Planner", to: "/dispatch/planners/driver" },
  { label: "Truck Planner", to: "/dispatch/planners/truck" },
  { label: "Loads Planner", to: "/dispatch/planners/loads" },
] as const;

export function DispatchPlannersLayout({ children }: { children?: ReactNode }) {
  const today = new Date().toISOString().split("T")[0];
  const [filters, setFilters] = useState<FilterState>({
    period: "this_week",
    from: today,
    to: today,
  });

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
        <UniversalFilterBar value={filters} onChange={setFilters} />
        {children}
      </div>
    </PlannerRangeProvider>
  );
}
