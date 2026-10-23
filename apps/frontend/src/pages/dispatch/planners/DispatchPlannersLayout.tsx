import { NavLink } from "react-router-dom";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { PageHeader } from "../../../components/layout/PageHeader";
import "./planner-design-tokens.css";
import { PlannerRangeProvider } from "./PlannerRangeContext";
import { PlannerRangeToolbar } from "./PlannerRangeToolbar";
import { UniversalFilterBar, type FilterState, type PeriodPreset } from "../../../components/planner/UniversalFilterBar";
import { DEFAULT_PLANNER_RANGE_DAYS, buildPlannerRange, plannerPresetRange, type PlannerPresetKey } from "./planner-range";
import { usePlannerRange } from "./PlannerRangeContext";
import { companyToday } from "../../../lib/businessDate";

const TABS = [
  // Timeline (Phase 1) is the default unified view; the 3 legacy planners stay reachable (archive-not-delete).
  { label: "Timeline", to: "/dispatch/planners/timeline" },
  { label: "Driver Planner", to: "/dispatch/planners/driver" },
  { label: "Truck Planner", to: "/dispatch/planners/truck" },
  { label: "Loads Planner", to: "/dispatch/planners/loads" },
] as const;

/**
 * ROUND 20.6 S4 (owner-live 2026-09-12, supersedes the earlier K.9 "0 clicks to see controls"
 * intent below): defaultOpen={true} meant the Filters popover was open on every first load AND
 * re-opened on every tab switch (this component remounts per tab), covering the top-left quadrant
 * including the first three data rows on every single tab visit. It must open closed and stay
 * closed until the operator asks for it.
 */
// LEAD 443.251 item 4 (owner 10-22: "the range, should be in a filter format"): Today, This week,
// Next 7 days, 14 days — computed from the COMPANY date (the shared bar's presets use the UTC date).
const PLANNER_PRESET_KEYS: PeriodPreset[] = ["today", "this_week", "next_7", "next_14", "custom"];
const WEEKDAY_TOGGLES: Array<{ index: number; label: string }> = [
  { index: 1, label: "Mo" },
  { index: 2, label: "Tu" },
  { index: 3, label: "We" },
  { index: 4, label: "Th" },
  { index: 5, label: "Fr" },
  { index: 6, label: "Sa" },
  { index: 0, label: "Su" },
];

function shortDate(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" });
}

/** LEAD 443.251 item 4 — "Show days" toggles, inside the Filters popover. */
function PlannerShowDays() {
  const { hiddenWeekdays, setHiddenWeekdays } = usePlannerRange();
  return (
    <div className="space-y-1.5" data-testid="planner-show-days">
      <div className="text-xs font-semibold text-gray-600">Show days</div>
      <div className="flex flex-wrap gap-1">
        {WEEKDAY_TOGGLES.map((day) => {
          const shown = !hiddenWeekdays.includes(day.index);
          return (
            <button
              key={day.index}
              type="button"
              aria-pressed={shown}
              data-testid={`planner-show-day-${day.label}`}
              className={`h-7 w-8 rounded-sm border text-xs font-semibold ${shown ? "border-[#1F2A44] bg-[#1F2A44] text-white" : "border-gray-200 bg-[var(--surface-unselected)] text-gray-500 hover:bg-[var(--surface-hover)]"}`}
              onClick={() =>
                setHiddenWeekdays(shown ? [...hiddenWeekdays, day.index] : hiddenWeekdays.filter((d) => d !== day.index))
              }
            >
              {day.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** LEAD 443.251 item 4 — active filters as removable chips under the bar. */
function PlannerFilterChips() {
  const { range, setRange, hiddenWeekdays, setHiddenWeekdays } = usePlannerRange();
  const hiddenLabels = WEEKDAY_TOGGLES.filter((d) => hiddenWeekdays.includes(d.index)).map((d) => d.label);
  return (
    <div className="flex flex-wrap items-center gap-1.5 text-xs" data-testid="planner-filter-chips">
      <span className="inline-flex items-center gap-1 rounded-sm border border-[#E5E7EB] bg-white px-2 py-0.5" data-testid="planner-chip-range">
        {range.start === range.end ? shortDate(range.start) : `${shortDate(range.start)} – ${shortDate(range.end)}`}
        <button
          type="button"
          aria-label="Reset the date range"
          className="text-gray-500 hover:text-gray-900"
          onClick={() => setRange(buildPlannerRange(DEFAULT_PLANNER_RANGE_DAYS))}
        >
          ×
        </button>
      </span>
      {hiddenLabels.length > 0 ? (
        <span className="inline-flex items-center gap-1 rounded-sm border border-[#E5E7EB] bg-white px-2 py-0.5" data-testid="planner-chip-hidden-days">
          Hidden: {hiddenLabels.join(", ")}
          <button type="button" aria-label="Show every day" className="text-gray-500 hover:text-gray-900" onClick={() => setHiddenWeekdays([])}>
            ×
          </button>
        </span>
      ) : null}
    </div>
  );
}

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
    if (next.period !== "custom" && PLANNER_PRESET_KEYS.includes(next.period)) {
      const preset = plannerPresetRange(next.period as PlannerPresetKey);
      next = { ...next, from: preset.start, to: preset.end };
    }
    setFilters(next);
    setRange({ start: next.from, end: next.to });
  };

  // The range toolbar (7d / 14d / 30d / Custom) and the Show-days toggles live INSIDE the Filters
  // popover now — no button row outside it (owner 10-22).
  return (
    <>
      <UniversalFilterBar
        value={filters}
        onChange={applyFilters}
        defaultPeriod="custom"
        defaultOpen={false}
        presetKeys={PLANNER_PRESET_KEYS}
        extra={
          <>
            <PlannerRangeToolbar />
            <PlannerShowDays />
          </>
        }
      />
      <PlannerFilterChips />
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
  a.download = `planner-${companyToday()}.csv`;
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
      {/* ROUND-20.7 (APP-WIDE AUTOFIT LAW, owner 2026-09-12): this shell used to cap at a fixed
          1400px width regardless of window size -- measured live at a 2234px content width,
          that threw away 834px and forced the planner grid's own horizontal scroll to kick in for
          date ranges that would otherwise have fit. A data board (this is one) gets no page-level
          px cap; PlannerGrid.tsx's own dayPx sizing (Math.max(44, Math.min(120, available /
          days.length))) already fills whatever width it's actually given -- it just needed the
          real width, not 1400px, to work with. */}
      <div data-testid="dispatch-planners-layout" className="w-full space-y-3">
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
