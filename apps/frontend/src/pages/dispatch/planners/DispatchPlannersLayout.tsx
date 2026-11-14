import { useLocation, useSearchParams } from "react-router-dom";
import type { CSSProperties, ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { PageHeader, V3_HEADER_ACTION_STYLE } from "../../../components/forms/shared/PageHeader";
import { NavyPageSubNav } from "../../../components/layout/NavyPageSubNav";
import { resolveBackHref } from "../../../lib/returnContext";
import "./planner-design-tokens.css";
import { PlannerRangeProvider } from "./PlannerRangeContext";
import type { PeriodPreset } from "../../../components/planner/UniversalFilterBar";
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
import { listAllCustomers } from "../../../api/catalog-customers";
import { listAllDrivers, listAllUnits } from "../../../api/mdata";
import { formatPersonName } from "../../../lib/formatPersonName";
import { DatePicker } from "../../../components/forms/DatePicker";
import { V3 } from "../../../design/v3-tokens";

/** ROUND 9.4 Board 12 — data-v3-board name per planner route (docs/design/v3/Dispatch-TruckPlanner). */
function plannerBoardId(pathname: string): string | undefined {
  if (pathname.includes("/planners/truck")) return "Dispatch-TruckPlanner";
  return undefined;
}

function plannerCrumb(pathname: string): string {
  if (pathname.includes("/planners/truck")) return "Dispatch › Planners › Truck";
  if (pathname.includes("/planners/driver")) return "Dispatch › Planners › Driver";
  if (pathname.includes("/planners/loads")) return "Dispatch › Planners › Loads";
  if (pathname.includes("/planners/timeline")) return "Dispatch › Planners › Timeline";
  return "Dispatch › Planners";
}

const V3_LABEL: CSSProperties = { font: `700 11px ${V3.font}`, color: V3.muted, lineHeight: "normal" };
const V3_CHIP_BTN: CSSProperties = {
  height: 28,
  padding: "0 12px",
  display: "inline-flex",
  alignItems: "center",
  borderRadius: 6,
  font: `600 12px ${V3.font}`,
  background: V3.surface,
  color: V3.ink,
  border: `1px solid ${V3.border}`,
  cursor: "pointer",
  lineHeight: "normal",
};
const V3_SEG_SHELL: CSSProperties = {
  display: "inline-flex",
  background: V3.surface,
  border: `1px solid ${V3.border}`,
  borderRadius: 6,
  padding: 2,
  gap: 2,
};
const V3_SEG = (on: boolean): CSSProperties => ({
  padding: "4px 10px",
  borderRadius: 4,
  font: `600 11px ${V3.font}`,
  background: on ? V3.shell : "transparent",
  color: on ? V3.onShell : V3.muted,
  border: "none",
  cursor: "pointer",
  lineHeight: "normal",
});
const V3_DAY = (on: boolean): CSSProperties => ({
  width: 28,
  height: 26,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  borderRadius: 4,
  font: `600 11px ${V3.font}`,
  background: on ? V3.shell : "transparent",
  color: on ? V3.onShell : V3.muted,
  border: on ? "none" : `1px solid ${V3.border}`,
  cursor: "pointer",
  lineHeight: "normal",
});
const V3_FOOT_BTN = (primary: boolean): CSSProperties => ({
  height: 28,
  padding: "0 12px",
  display: "flex",
  alignItems: "center",
  borderRadius: 6,
  font: `600 12px ${V3.font}`,
  background: primary ? V3.shell : V3.surface,
  color: primary ? V3.onShell : V3.ink,
  border: primary ? "none" : `1px solid ${V3.border}`,
  cursor: "pointer",
  lineHeight: "normal",
});
const V3_FILTER_CHIP: CSSProperties = {
  padding: "3px 8px",
  border: `1px solid ${V3.border}`,
  borderRadius: 999,
  background: V3.surface,
  fontSize: 11,
  fontWeight: 400,
  color: V3.muted,
  fontFamily: V3.font,
  lineHeight: "normal",
  display: "inline-flex",
  alignItems: "center",
  gap: 4,
};

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

/** LEAD 443.251 item 4 / ROUND 9.4 — board "SHOW DAYS" toggles (Dispatch-TruckPlanner.dc.html). */
function PlannerShowDays() {
  const { hiddenWeekdays, setHiddenWeekdays } = usePlannerRange();
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }} data-testid="planner-show-days">
      <div style={V3_LABEL}>SHOW DAYS</div>
      <div style={{ display: "flex", gap: 4 }}>
        {WEEKDAY_TOGGLES.map((day) => {
          const shown = !hiddenWeekdays.includes(day.index);
          return (
            <button
              key={day.index}
              type="button"
              aria-pressed={shown}
              data-testid={`planner-show-day-${day.label}`}
              style={V3_DAY(shown)}
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
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }} data-testid="planner-entity-filters">
      <div style={V3_LABEL}>STATUS · DRIVER · UNIT · CUSTOMER</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
        <div className="min-w-[180px]" data-testid="planner-filter-status">
          <MultiSelectDropdown
            label="Status"
            options={PLANNER_STATUS_OPTIONS}
            selected={value.status}
            onChange={(next) => onChange({ ...value, status: next as PlannerEntityStatus[] })}
            allLabel="All statuses ▾"
            data-testid="planner-filter-status-multiselect"
          />
        </div>
        <div className="min-w-[180px] flex-1" data-testid="planner-filter-driver">
          <MultiSelectDropdown
            label="Driver"
            options={driverOptions}
            selected={value.driverIds}
            onChange={(next) => onChange({ ...value, driverIds: next })}
            allLabel="All drivers ▾"
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
            allLabel="All units ▾"
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
            allLabel="All customers ▾"
            searchable
            loading={customersQuery.isFetching}
            data-testid="planner-filter-customer-multiselect"
          />
        </div>
      </div>
    </div>
  );
}

/** LEAD 443.251 / ROUND 9.4 — board chips: "Oct 20 → Oct 23 ✕" (Dispatch-TruckPlanner.dc.html). */
const CHIP_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function chipDate(ymd: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(ymd);
  return m ? `${CHIP_MONTHS[Number(m[2]) - 1]} ${Number(m[3])}` : ymd;
}
function boardFullDate(ymd: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(ymd);
  return m ? `${CHIP_MONTHS[Number(m[2]) - 1]} ${Number(m[3])}, ${m[1]}` : ymd;
}

/** Board sample "Tue–Fri only" when Sat+Sun+Mon hidden (or the shown-day span). */
function shownDaysChipLabel(hiddenWeekdays: number[]): string | null {
  if (hiddenWeekdays.length === 0) return null;
  const shown = WEEKDAY_TOGGLES.filter((d) => !hiddenWeekdays.includes(d.index)).map((d) => d.label);
  if (shown.length === 0) return "No days";
  if (shown.join("") === "TuWeThFr") return "Tue–Fri only";
  return `${shown[0]}–${shown[shown.length - 1]} only`;
}

function PlannerFilterChips() {
  const { range, setRange, hiddenWeekdays, setHiddenWeekdays, entityFilters, setEntityFilters } = usePlannerRange();
  const statusLabel =
    entityFilters.status.length === 0
      ? null
      : entityFilters.status.map((s) => PLANNER_STATUS_LABEL[s]).join(" · ");
  const daysLabel = shownDaysChipLabel(hiddenWeekdays);
  const rangeText =
    range.start === range.end ? `${chipDate(range.start)} ✕` : `${chipDate(range.start)} → ${chipDate(range.end)} ✕`;
  return (
    <span
      style={{ display: "inline-flex", gap: 6, alignItems: "center", fontSize: 11, color: V3.muted, marginTop: 6, flexWrap: "wrap" }}
      data-testid="planner-filter-chips"
    >
      <span style={V3_FILTER_CHIP} data-testid="planner-chip-range" data-v3="chip.range">
        {rangeText}
        <button
          type="button"
          aria-label="Reset the date range"
          style={{ border: "none", background: "none", padding: 0, cursor: "pointer", color: "inherit", font: "inherit" }}
          onClick={() => setRange(buildPlannerRange(DEFAULT_PLANNER_RANGE_DAYS))}
        />
      </span>
      {daysLabel ? (
        <span style={V3_FILTER_CHIP} data-testid="planner-chip-hidden-days" data-v3="chip.days">
          {`${daysLabel} ✕`}
          <button
            type="button"
            aria-label="Show every day"
            style={{ border: "none", background: "none", padding: 0, cursor: "pointer", color: "inherit", font: "inherit" }}
            onClick={() => setHiddenWeekdays([])}
          />
        </span>
      ) : null}
      {statusLabel ? (
        <span style={V3_FILTER_CHIP} data-testid="planner-chip-status" data-v3="chip.status">
          {`${statusLabel} ✕`}
          <button
            type="button"
            aria-label="Clear status filter"
            style={{ border: "none", background: "none", padding: 0, cursor: "pointer", color: "inherit", font: "inherit" }}
            onClick={() => setEntityFilters({ ...entityFilters, status: [] })}
          />
        </span>
      ) : null}
      {entityFilters.driverIds.length > 0 ? (
        <span style={V3_FILTER_CHIP} data-testid="planner-chip-driver">
          {`Driver: ${entityFilters.driverIds.length} ✕`}
          <button
            type="button"
            aria-label="Clear driver filter"
            style={{ border: "none", background: "none", padding: 0, cursor: "pointer", color: "inherit", font: "inherit" }}
            onClick={() => setEntityFilters({ ...entityFilters, driverIds: [] })}
          />
        </span>
      ) : null}
      {entityFilters.unitIds.length > 0 ? (
        <span style={V3_FILTER_CHIP} data-testid="planner-chip-unit">
          {entityFilters.unitIds.length === 1 ? (
            <EntityLink kind="unit" id={entityFilters.unitIds[0]} label={entityFilters.unitIds[0]} />
          ) : (
            `Unit: ${entityFilters.unitIds.length} ✕`
          )}
          <button
            type="button"
            aria-label="Clear unit filter"
            style={{ border: "none", background: "none", padding: 0, cursor: "pointer", color: "inherit", font: "inherit" }}
            onClick={() => setEntityFilters({ ...entityFilters, unitIds: [] })}
          />
        </span>
      ) : null}
      {entityFilters.customerIds.length > 0 ? (
        <span style={V3_FILTER_CHIP} data-testid="planner-chip-customer">
          {`Customer: ${entityFilters.customerIds.length} ✕`}
          <button
            type="button"
            aria-label="Clear customer filter"
            style={{ border: "none", background: "none", padding: 0, cursor: "pointer", color: "inherit", font: "inherit" }}
            onClick={() => setEntityFilters({ ...entityFilters, customerIds: [] })}
          />
        </span>
      ) : null}
    </span>
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

/**
 * ROUND 9.4 Board 12 — Filters chrome identical to Dispatch-TruckPlanner.dc.html:
 * "Filters · N ▾" trigger, DATE RANGE / SHOW DAYS / STATUS · DRIVER · UNIT · CUSTOMER,
 * Reset/Apply, chips. Panel stays mounted (visually hidden when closed) so the parity
 * reader can resolve board keys without a covering absolute popover on the grid.
 */
function PlannerControls() {
  const { range, setRange, entityFilters, setEntityFilters, hiddenWeekdays } = usePlannerRange();
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [draftFrom, setDraftFrom] = useState(range.start);
  const [draftTo, setDraftTo] = useState(range.end);
  const [draftPeriod, setDraftPeriod] = useState<PlannerPresetKey | "custom">("custom");
  const [draftEntityFilters, setDraftEntityFilters] = useState<PlannerEntityFilterState>(entityFilters);

  useEffect(() => {
    setDraftFrom(range.start);
    setDraftTo(range.end);
  }, [range.end, range.start]);

  useEffect(() => {
    setDraftEntityFilters(entityFilters);
  }, [entityFilters]);

  const activeFilterCount =
    1 + // date range always counts (board sample "Filters · 3")
    (hiddenWeekdays.length > 0 ? 1 : 0) +
    (entityFilters.status.length > 0 ||
    entityFilters.driverIds.length > 0 ||
    entityFilters.unitIds.length > 0 ||
    entityFilters.customerIds.length > 0
      ? 1
      : 0);

  const applyPreset = (key: PlannerPresetKey) => {
    const preset = plannerPresetRange(key);
    setDraftPeriod(key);
    setDraftFrom(preset.start);
    setDraftTo(preset.end);
  };

  const onApply = () => {
    if (draftPeriod !== "custom" && PLANNER_PRESET_KEYS.includes(draftPeriod as PeriodPreset)) {
      const preset = plannerPresetRange(draftPeriod as PlannerPresetKey);
      setRange({ start: preset.start, end: preset.end });
    } else {
      setRange({ start: draftFrom, end: draftTo });
    }
    setEntityFilters(draftEntityFilters);
    setFiltersOpen(false);
  };

  const onReset = () => {
    const next = buildPlannerRange(DEFAULT_PLANNER_RANGE_DAYS);
    setDraftPeriod("custom");
    setDraftFrom(next.start);
    setDraftTo(next.end);
    setDraftEntityFilters(EMPTY_PLANNER_ENTITY_FILTERS);
    setRange(next);
    setEntityFilters(EMPTY_PLANNER_ENTITY_FILTERS);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 0 }} data-testid="planner-v3-filters">
      <div style={{ display: "flex", gap: 8, alignItems: "flex-start", position: "relative" }}>
        <div style={{ position: "relative" }}>
          <button
            type="button"
            aria-expanded={filtersOpen}
            data-testid="planner-filters-toggle"
            data-v3="filters.toggle"
            onClick={() => setFiltersOpen((o) => !o)}
            style={V3_CHIP_BTN}
          >
            {`Filters · ${activeFilterCount} ▾`}
          </button>
          {/* Always mounted for parity reader; hide visually when closed (not display:none). */}
          <div
            data-testid="planner-filters-panel"
            aria-hidden={!filtersOpen}
            style={{
              position: "absolute",
              top: 34,
              left: 0,
              zIndex: filtersOpen ? 2 : -1,
              width: 330,
              background: V3.surface,
              border: `1px solid ${V3.border}`,
              borderRadius: 6,
              boxShadow: "0 8px 24px rgba(15,27,45,.12)",
              padding: 12,
              display: "flex",
              flexDirection: "column",
              gap: 10,
              fontSize: 12,
              fontFamily: V3.font,
              lineHeight: "normal",
              visibility: filtersOpen ? "visible" : "hidden",
              pointerEvents: filtersOpen ? "auto" : "none",
            }}
          >
            <div style={V3_LABEL}>DATE RANGE</div>
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <span style={V3_CHIP_BTN} data-v3="date.from">{boardFullDate(draftFrom)}</span>
              <span style={{ alignSelf: "center", font: `400 12px ${V3.font}` }}>→</span>
              <span style={V3_CHIP_BTN} data-v3="date.to">{boardFullDate(draftTo)}</span>
            </div>
            {/* Hidden pickers keep Apply Law / live range editable without board chrome drift. */}
            <div style={{ display: "flex", gap: 6 }}>
              <DatePicker box="filter" value={draftFrom} onChange={(v) => { setDraftPeriod("custom"); setDraftFrom(v); }} aria-label="Range start" />
              <DatePicker box="filter" value={draftTo} onChange={(v) => { setDraftPeriod("custom"); setDraftTo(v); }} aria-label="Range end" />
            </div>
            <div style={V3_SEG_SHELL}>
              {(
                [
                  ["today", "Today"],
                  ["this_week", "This week"],
                  ["next_7", "Next 7 days"],
                  ["next_14", "14 days"],
                ] as const
              ).map(([key, label]) => (
                <button key={key} type="button" style={V3_SEG(draftPeriod === key)} onClick={() => applyPreset(key)}>
                  {label}
                </button>
              ))}
            </div>
            <PlannerShowDays />
            <PlannerEntityFilters value={draftEntityFilters} onChange={setDraftEntityFilters} />
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 6 }}>
              <button type="button" style={V3_FOOT_BTN(false)} data-testid="planner-filter-reset" onClick={onReset}>
                Reset
              </button>
              <button type="button" style={V3_FOOT_BTN(true)} data-testid="planner-filter-apply" onClick={onApply}>
                Apply
              </button>
            </div>
          </div>
        </div>
        <PlannerFilterChips />
      </div>
    </div>
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
    <>
      <button type="button" onClick={() => exportPlannerCsv(dateRange)} style={V3_HEADER_ACTION_STYLE}>
        Export CSV
      </button>
      <button type="button" onClick={() => window.print()} style={V3_HEADER_ACTION_STYLE}>
        Print
      </button>
    </>
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
  const boardId = plannerBoardId(location.pathname);
  const tabItems = TABS.map((tab) => ({
    label: tab.label,
    // ROUND 8.20 board 12 — keep applied planner_* cohort query across Truck/Driver/Loads tabs.
    to: `${tab.to}${location.search || ""}`,
  }));
  return (
    <PlannerRangeProvider>
      {/* ROUND 9.4 Board 12 — V3 shell identical to docs/design/v3/Dispatch-TruckPlanner.dc.html.
          No page-level px cap (ROUND-20.7 autofit); PlannerGrid fills the real width. */}
      <div
        data-testid="dispatch-planners-layout"
        data-v3-board={boardId}
        style={{ width: "100%", lineHeight: "normal", fontFamily: V3.font, color: V3.ink }}
      >
        <PageHeader
          variant="v3"
          crumb={plannerCrumb(location.pathname)}
          backHref={plannerBackHref}
          title="Dispatch Planners"
          subtitle="Driver availability and load timeline — shared date range"
          actions={<PlannerExportButtons />}
        />
        <div style={{ marginTop: 4 }} data-testid="dispatch-planners-tabs">
          <NavyPageSubNav items={tabItems} />
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 12 }}>
          <PlannerControls />
          {children}
        </div>
      </div>
    </PlannerRangeProvider>
  );
}
