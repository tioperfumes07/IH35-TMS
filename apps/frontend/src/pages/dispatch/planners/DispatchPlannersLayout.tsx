import { NavLink, useLocation, useSearchParams } from "react-router-dom";
import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "../../../components/layout/PageHeader";
import { resolveBackHref } from "../../../lib/returnContext";
import "./planner-design-tokens.css";
import { PlannerRangeProvider } from "./PlannerRangeContext";
import { PlannerRangeToolbar } from "./PlannerRangeToolbar";
import { UniversalFilterBar, type FilterState, type PeriodPreset } from "../../../components/planner/UniversalFilterBar";
import { MultiSelectDropdown } from "../../../components/forms/MultiSelectDropdown";
import { EntityLink } from "../../../components/shared/EntityLink";
import { useCompanyContext } from "../../../contexts/CompanyContext";
import {
  DEFAULT_PLANNER_RANGE_DAYS,
  EMPTY_PLANNER_ENTITY_FILTERS,
  buildPlannerRange,
  plannerPresetRange,
  type PlannerEntityFilterState,
  type PlannerEntityStatus,
  type PlannerPresetKey,
} from "./planner-range";
import { usePlannerRange } from "./PlannerRangeContext";
import { companyToday } from "../../../lib/businessDate";
import { formatDateUS } from "../../../lib/formatDate";
import { listAllCustomers } from "../../../api/catalog-customers";
import { listAllDrivers, listAllUnits } from "../../../api/mdata";
import { formatPersonName } from "../../../lib/formatPersonName";

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
  // Round 7.6 — MM/DD/YYYY (not browser short month-day without year).
  return formatDateUS(ymd) || "—";
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

const PLANNER_STATUS_OPTIONS: Array<{ value: PlannerEntityStatus; label: string }> = [
  { value: "in-use", label: "In Use" },
  { value: "available", label: "Available" },
  { value: "reserved", label: "Reserved" },
  { value: "in-shop", label: "In Shop" },
];

const PLANNER_STATUS_LABEL: Record<PlannerEntityStatus, string> = {
  "in-use": "In Use",
  available: "Available",
  reserved: "Reserved",
  "in-shop": "In Shop",
};

/** D3 + U12/R1 — board entity-filter heading + Status + Driver MultiSelectDropdown (Dispatch-TruckPlanner.dc.html). */
function PlannerEntityFilters({
  value,
  onChange,
}: {
  value: PlannerEntityFilterState;
  onChange: (next: PlannerEntityFilterState) => void;
}) {
  const { selectedCompanyId: operatingCompanyId } = useCompanyContext();
  // Codex ROUND 8.5 / #28836: never pass movement-derived status=Active alone — that drops
  // HR-Active drivers with no recent movement. Match Book Load EntityPicker: unscoped roster
  // read, then keep Active+Probation (FAIL-CA1) and live rows only.
  const driversQuery = useQuery({
    queryKey: ["planner-entity-filter-drivers", operatingCompanyId, "hr-active-or-probation"],
    queryFn: async () => {
      const res = await listAllDrivers({ operating_company_id: operatingCompanyId as string });
      const drivers = (res.drivers ?? []).filter((d) => {
        if (d.deactivated_at != null) return false;
        if ((d as { merged_into_driver_id?: string | null }).merged_into_driver_id) return false;
        return ["Active", "Probation"].includes(String((d as { status?: string | null }).status ?? ""));
      });
      return { drivers, total: drivers.length };
    },
    enabled: Boolean(operatingCompanyId),
  });
  const driverOptions = useMemo(
    () =>
      (driversQuery.data?.drivers ?? []).map((d) => ({
        value: String(d.id),
        label: formatPersonName(`${d.first_name ?? ""} ${d.last_name ?? ""}`.trim()) || String(d.id),
      })),
    [driversQuery.data],
  );
  const unitsQuery = useQuery({
    queryKey: ["planner-entity-filter-units", operatingCompanyId],
    // Power units for Truck Planner — omit type so Tractor + Truck both appear (board Unit filter).
    queryFn: () => listAllUnits({ operating_company_id: operatingCompanyId as string }),
    enabled: Boolean(operatingCompanyId),
  });
  const unitOptions = useMemo(
    () =>
      (unitsQuery.data?.units ?? []).map((raw) => {
        const u = raw as { id?: string; unit_number?: string | null };
        return {
          value: String(u.id ?? ""),
          label: String(u.unit_number ?? u.id ?? ""),
        };
      }).filter((o) => o.value),
    [unitsQuery.data],
  );
  const customersQuery = useQuery({
    queryKey: ["planner-entity-filter-customers", operatingCompanyId],
    queryFn: () => listAllCustomers({ operating_company_id: operatingCompanyId as string }),
    enabled: Boolean(operatingCompanyId),
  });
  const customerOptions = useMemo(
    () =>
      (customersQuery.data?.customers ?? []).map((c) => ({
        value: String(c.id),
        label: String(c.name ?? c.id),
      })),
    [customersQuery.data],
  );
  return (
    <div className="space-y-1.5" data-testid="planner-entity-filters">
      <div className="text-section-header font-bold uppercase tracking-[0.04em] text-[#5B6576]">Status · Driver · Unit · Customer</div>
      <div className="flex flex-wrap items-center gap-2">
        <div className="min-w-[180px]" data-testid="planner-filter-status">
          <MultiSelectDropdown
            label="Status"
            options={PLANNER_STATUS_OPTIONS}
            selected={value.status}
            onChange={(next) => onChange({ ...value, status: next as PlannerEntityStatus[] })}
            allLabel="All statuses"
            data-testid="planner-filter-status-multiselect"
          />
        </div>
        <div className="min-w-[180px] flex-1" data-testid="planner-filter-driver">
          <MultiSelectDropdown
            label="Driver"
            options={driverOptions}
            selected={value.driverIds}
            onChange={(next) => onChange({ ...value, driverIds: next })}
            allLabel="All drivers"
            searchable
            loading={driversQuery.isFetching}
            data-testid="planner-filter-driver-multiselect"
          />
        </div>
        <div className="min-w-[180px] flex-1" data-testid="planner-filter-unit">
          <MultiSelectDropdown
            label="Unit"
            options={unitOptions}
            selected={value.unitIds}
            onChange={(next) => onChange({ ...value, unitIds: next })}
            allLabel="All units"
            searchable
            loading={unitsQuery.isFetching}
            data-testid="planner-filter-unit-multiselect"
          />
        </div>
        <div className="min-w-[180px] flex-1" data-testid="planner-filter-customer">
          <MultiSelectDropdown
            label="Customer"
            options={customerOptions}
            selected={value.customerIds}
            onChange={(next) => onChange({ ...value, customerIds: next })}
            allLabel="All customers"
            searchable
            loading={customersQuery.isFetching}
            data-testid="planner-filter-customer-multiselect"
          />
        </div>
      </div>
    </div>
  );
}

/** LEAD 443.251 item 4 — active filters as removable chips under the bar. */
function PlannerFilterChips() {
  const { range, setRange, hiddenWeekdays, setHiddenWeekdays, entityFilters, setEntityFilters } = usePlannerRange();
  const hiddenLabels = WEEKDAY_TOGGLES.filter((d) => hiddenWeekdays.includes(d.index)).map((d) => d.label);
  const statusLabel =
    entityFilters.status.length === 0
      ? null
      : entityFilters.status.map((s) => PLANNER_STATUS_LABEL[s]).join(" · ");
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
      {statusLabel ? (
        <span className="inline-flex items-center gap-1 rounded-sm border border-[#E5E7EB] bg-white px-2 py-0.5" data-testid="planner-chip-status">
          Status: {statusLabel}
          <button
            type="button"
            aria-label="Clear status filter"
            className="text-gray-500 hover:text-gray-900"
            onClick={() => setEntityFilters({ ...entityFilters, status: [] })}
          >
            ×
          </button>
        </span>
      ) : null}
      {entityFilters.driverIds.length > 0 ? (
        <span className="inline-flex items-center gap-1 rounded-sm border border-[#E5E7EB] bg-white px-2 py-0.5" data-testid="planner-chip-driver">
          Driver: {entityFilters.driverIds.length} selected
          <button
            type="button"
            aria-label="Clear driver filter"
            className="text-gray-500 hover:text-gray-900"
            onClick={() => setEntityFilters({ ...entityFilters, driverIds: [] })}
          >
            ×
          </button>
        </span>
      ) : null}
      {entityFilters.unitIds.length > 0 ? (
        <span className="inline-flex items-center gap-1 rounded-sm border border-[#E5E7EB] bg-white px-2 py-0.5" data-testid="planner-chip-unit">
          {entityFilters.unitIds.length === 1 ? (
            <EntityLink kind="unit" id={entityFilters.unitIds[0]} label={entityFilters.unitIds[0]} />
          ) : (
            <>Unit: {entityFilters.unitIds.length} selected</>
          )}
          <button
            type="button"
            aria-label="Clear unit filter"
            className="text-gray-500 hover:text-gray-900"
            onClick={() => setEntityFilters({ ...entityFilters, unitIds: [] })}
          >
            ×
          </button>
        </span>
      ) : null}
      {entityFilters.customerIds.length > 0 ? (
        <span className="inline-flex items-center gap-1 rounded-sm border border-[#E5E7EB] bg-white px-2 py-0.5" data-testid="planner-chip-customer">
          Customer: {entityFilters.customerIds.length} selected
          <button
            type="button"
            aria-label="Clear customer filter"
            className="text-gray-500 hover:text-gray-900"
            onClick={() => setEntityFilters({ ...entityFilters, customerIds: [] })}
          >
            ×
          </button>
        </span>
      ) : null}
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

function entityFiltersEqual(a: PlannerEntityFilterState, b: PlannerEntityFilterState): boolean {
  const same = <T,>(x: readonly T[], y: readonly T[]) => x.length === y.length && x.every((v, i) => v === y[i]);
  return (
    same(a.status, b.status) &&
    same(a.driverIds, b.driverIds) &&
    same(a.unitIds, b.unitIds) &&
    same(a.customerIds, b.customerIds)
  );
}

function PlannerControls() {
  const { range, setRange, entityFilters, setEntityFilters } = usePlannerRange();
  const [filters, setFilters] = useState<FilterState>({
    period: "custom",
    from: range.start,
    to: range.end,
  });
  // ROUND 8.17 class R Board 12 — entity filters stage until Apply; Cancel discards draft.
  const [draftEntityFilters, setDraftEntityFilters] = useState<PlannerEntityFilterState>(entityFilters);

  useEffect(() => {
    setFilters((current) =>
      current.from === range.start && current.to === range.end
        ? current
        : { ...current, period: "custom", from: range.start, to: range.end }
    );
  }, [range.end, range.start]);

  useEffect(() => {
    setDraftEntityFilters(entityFilters);
  }, [entityFilters]);

  const applyFilters = (next: FilterState) => {
    if (next.period !== "custom" && PLANNER_PRESET_KEYS.includes(next.period)) {
      const preset = plannerPresetRange(next.period as PlannerPresetKey);
      next = { ...next, from: preset.start, to: preset.end };
    }
    setFilters(next);
    setRange({ start: next.from, end: next.to });
  };

  const entityDirty = !entityFiltersEqual(draftEntityFilters, entityFilters);

  return (
    <>
      <UniversalFilterBar
        value={filters}
        onChange={applyFilters}
        defaultPeriod="custom"
        defaultOpen={false}
        presetKeys={PLANNER_PRESET_KEYS}
        extraDirty={entityDirty}
        onExtraApply={() => setEntityFilters(draftEntityFilters)}
        onExtraCancel={() => setDraftEntityFilters(entityFilters)}
        onExtraReset={() => {
          setDraftEntityFilters(EMPTY_PLANNER_ENTITY_FILTERS);
          setEntityFilters(EMPTY_PLANNER_ENTITY_FILTERS);
        }}
        extra={
          <>
            <PlannerRangeToolbar />
            <PlannerShowDays />
            <PlannerEntityFilters value={draftEntityFilters} onChange={setDraftEntityFilters} />
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
  const location = useLocation();
  const [searchParams] = useSearchParams();
  // ROUND 8.20 board12 — unit/detail drills attach ?ret=; Planner Back restores origin.
  const plannerBackHref = resolveBackHref({
    searchParams,
    pathname: location.pathname,
    fallback: "/dispatch",
  });
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
        <PageHeader backHref={plannerBackHref}
          title="Dispatch Planners"
          subtitle="Driver leave, truck availability, and load timeline — shared date range"
          actions={<PlannerExportButtons />}
        />
        <nav aria-label="Dispatch planner views" className="flex min-w-0 gap-1 overflow-x-auto rounded-sm bg-[var(--planner-active)] p-1 text-xs">
          {TABS.map((tab) => (
            <NavLink
              key={tab.to}
              // ROUND 8.20 board 12 — keep applied planner_* cohort query across Truck/Driver/Loads tabs.
              to={{ pathname: tab.to, search: location.search }}
              className={({ isActive }: { isActive: boolean }) =>
                `flex h-7 shrink-0 items-center rounded-sm px-3 text-xs font-medium text-white ${isActive ? "bg-[var(--planner-tab-selected)]" : "hover:bg-[var(--planner-tab-hover)]"}`
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
