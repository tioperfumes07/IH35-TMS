import { NavLink } from "react-router-dom";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { PageHeader } from "../../../components/layout/PageHeader";
import "./planner-design-tokens.css";
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

/**
 * K.9 pattern — 0 clicks to see controls. The filter bar (period + date range) is
 * visible on first load via defaultOpen={true} on the CollapsedListFilters inside
 * UniversalFilterBar.
 */
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
      <UniversalFilterBar value={filters} onChange={applyFilters} defaultPeriod="custom" defaultOpen={true} />
      <PlannerRangeToolbar />
    </>
  );
}

/**
 * Export the currently rendered planner grid as CSV. The planner data lives in
 * child pages (Driver/Truck/Loads/Timeline), each with their own query — the layout
 * doesn't hold the rows. For a first pass we scrape the rendered DOM: each planner
 * row (.pg-r) has a frozen name cell (.pg-col-name) and a track (.pg-track) with
 * bars ([data-load-id]) whose title/aria-label carries the load label. The date
 * range comes from the shared PlannerRangeContext.
 */
function exportPlannerCsv(dateRange: string) {
  const headers = ["Row", "Load", "Date Range", "Status"];
  const rows: string[][] = [];

  const gridRows = document.querySelectorAll<HTMLElement>(".pg-r");
  gridRows.forEach((gridRow) => {
    const nameEl = gridRow.querySelector<HTMLElement>(".pg-col-name");
    const rowName = nameEl?.getAttribute("title") || nameEl?.textContent?.trim() || "";
    const statusEl = gridRow.querySelector<HTMLElement>('[data-testid="planner-row-status"]');
    const status = statusEl?.textContent?.trim() || "";

    const bars = gridRow.querySelectorAll<HTMLElement>("[data-load-id]");
    if (bars.length === 0) {
      // Idle row with no loads — still export it so the CSV reflects the full grid.
      rows.push([csvCell(rowName), "", csvCell(dateRange), csvCell(status)]);
    } else {
      bars.forEach((bar) => {
        const loadLabel = bar.getAttribute("title") || bar.getAttribute("aria-label") || "";
        rows.push([csvCell(rowName), csvCell(loadLabel), csvCell(dateRange), csvCell(status)]);
      });
    }
  });

  // Fallback: if no grid rows found (e.g. empty state), still produce a valid CSV with headers.
  const csv = [headers, ...rows].map((r) => r.join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `planner-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

/** Quote a CSV cell if it contains a comma, quote, or newline. */
function csvCell(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function PlannerExportButtons() {
  const { range } = usePlannerRange();
  const dateRange = `${range.start} to ${range.end}`;

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => exportPlannerCsv(dateRange)}
        className="rounded-sm border border-gray-300 bg-white px-3 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50"
      >
        Export CSV
      </button>
      <button
        type="button"
        onClick={() => window.print()}
        className="rounded-sm border border-gray-300 bg-white px-3 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50"
      >
        Print
      </button>
    </div>
  );
}

export function DispatchPlannersLayout({ children }: { children?: ReactNode }) {

  return (
    <PlannerRangeProvider>
      <div data-testid="dispatch-planners-layout" className="mx-auto max-w-[1400px] space-y-3">
        <PageHeader
          title="Dispatch Planners"
          subtitle="Driver leave, truck availability, and load timeline — shared date range"
          actions={<PlannerExportButtons />}
        />
        <nav className="flex flex-wrap gap-1 rounded-sm border border-gray-200 bg-white p-1 text-xs">
          {TABS.map((tab) => (
            <NavLink
              key={tab.to}
              to={tab.to}
              className={({ isActive }: { isActive: boolean }) =>
                `flex h-7 items-center rounded-sm px-3 text-xs font-medium ${isActive ? "bg-[var(--planner-active)] text-white" : "text-gray-700 hover:bg-gray-100"}`
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
