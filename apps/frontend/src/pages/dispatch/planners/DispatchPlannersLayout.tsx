import { NavLink } from "react-router-dom";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { PageHeader } from "../../../components/layout/PageHeader";
import { PlannerRangeProvider } from "./PlannerRangeContext";
import { PlannerRangeToolbar } from "./PlannerRangeToolbar";
import { UniversalFilterBar, type FilterState } from "../../../components/planner/UniversalFilterBar";
import { usePlannerRange } from "./PlannerRangeContext";

const TABS = [
  // Timeline (Phase 1) is the default unified view; the 3 legacy planners stay reachable (archive-not-delete).
  { label: "Timeline", to: "/dispatch/planners/timeline" },
  { label: "Driver Planner", to: "/dispatch/planners/driver" },
  { label: "Truck Planner", to: "/dispatch/planners/truck" },
  { label: "Loads Planner", to: "/dispatch/planners/loads" },
] as const;

function PlannerControls() {
  const { range, setRange } = usePlannerRange();
  const [filters, setFilters] = useState<FilterState>({
    period: "custom",
    from: range.start,
    to: range.end,
  });

  useEffect(() => {
    setFilters((current) =>
      current.from === range.start && current.to === range.end
        ? current
        : { ...current, period: "custom", from: range.start, to: range.end }
    );
  }, [range.end, range.start]);

  const applyFilters = (next: FilterState) => {
    setFilters(next);
    setRange({ start: next.from, end: next.to });
  };

  return (
    <>
      <UniversalFilterBar value={filters} onChange={applyFilters} defaultPeriod="custom" />
      <PlannerRangeToolbar />
    </>
  );
}

export function DispatchPlannersLayout({ children }: { children?: ReactNode }) {

  return (
    <PlannerRangeProvider>
      <div data-testid="dispatch-planners-layout" className="mx-auto max-w-[1400px] space-y-3">
        <PageHeader title="Dispatch Planners" subtitle="Driver leave, truck availability, and load timeline — shared date range" />
        <nav className="flex flex-wrap gap-1 rounded-sm border border-gray-200 bg-white p-1 text-xs">
          {TABS.map((tab) => (
            <NavLink
              key={tab.to}
              to={tab.to}
              className={({ isActive }: { isActive: boolean }) =>
                `rounded-sm px-3 py-1.5 font-medium ${isActive ? "bg-slate-800 text-white" : "text-gray-700 hover:bg-gray-100"}`
              }
            >
              {tab.label}
            </NavLink>
          ))}
        </nav>
        <PlannerControls />
        {children}
      </div>
    </PlannerRangeProvider>
  );
}
