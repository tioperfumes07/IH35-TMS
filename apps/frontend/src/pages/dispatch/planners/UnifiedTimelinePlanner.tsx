import { Fragment, useMemo, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { getDispatchPlannerWeek, type PlannerDriverRow, type PlannerLoadEvent } from "../../../api/dispatch";
import { driverSchedulerOfficeApi } from "../../../api/driver-scheduler";
import { ListErrorBanner } from "../../../components/shared/ListErrorBanner";
import { useCompanyContext } from "../../../contexts/CompanyContext";
import { userFacingApiError } from "../../../lib/api-error-message";
import { entityLabel } from "../../../lib/entity-label";
import { EntityLink } from "../../../components/shared/EntityLink";
import { EntityLinkOrTombstone } from "../../../components/shared/EntityLinkOrTombstone";
import { addDaysIso } from "./planner-range";
import { usePlannerRange } from "./PlannerRangeContext";
import { BookLoadModalV4 } from "../components/BookLoadModalV4";
import { PlannerAxisHead, plannerFrozenThClass } from "./PlannerAxisHead";
import { formatPlannerDwell, plannerDayBodyClass, todayYmdAmericaChicago } from "./plannerTimeAxis";

/**
 * Unified Dispatch Planner — Phase 1 "Timeline" view (Tasks-module pattern: one dataset, resource rows ×
 * date axis). FIXES the empty Driver grid: rows are fed from the DISPATCH planner feed (drivers[] + their
 * load bars) — NOT the Safety leave scheduler — with leave/availability layered ON TOP (Jorge's "both
 * layered" answer). Load bars are clickable → load drawer. Idle resources surface a "+ Book" affordance.
 * Read-only placement; drag-to-re-time/assign is Phase 2.
 */

function toDayKey(iso: string | null | undefined): string | null {
  return iso ? iso.slice(0, 10) : null;
}

async function fetchTimelineForRange(
  operatingCompanyId: string,
  rangeStart: string,
  rangeEnd: string
): Promise<{ drivers: PlannerDriverRow[]; loads: PlannerLoadEvent[] }> {
  // Enumerate the weeks the range spans, fetch them in parallel (no sequential hang — see #1330), then
  // merge: dedupe drivers by id, keep loads whose start day falls inside the range.
  const weekStarts: string[] = [];
  let weekStart = rangeStart;
  while (weekStart <= rangeEnd) {
    weekStarts.push(weekStart);
    weekStart = addDaysIso(weekStart, 7);
  }
  const payloads = await Promise.all(weekStarts.map((ws) => getDispatchPlannerWeek(operatingCompanyId, ws)));
  const driverById = new Map<string, PlannerDriverRow>();
  const loadById = new Map<string, PlannerLoadEvent>();
  for (const payload of payloads) {
    for (const d of payload.drivers) driverById.set(d.id, d);
    for (const l of payload.loads) {
      const day = toDayKey(l.start_at);
      if (day && day >= rangeStart && day <= rangeEnd) loadById.set(l.id, l);
    }
  }
  return { drivers: [...driverById.values()], loads: [...loadById.values()] };
}

function parseLeaveCells(rows: Array<Record<string, unknown>> | undefined): Map<string, string> {
  const m = new Map<string, string>();
  for (const row of rows ?? []) {
    const driverId = row.driver_id != null ? String(row.driver_id) : null;
    const date = row.leave_date != null ? String(row.leave_date).slice(0, 10) : null;
    const leaveType = row.leave_type != null ? String(row.leave_type) : "leave";
    if (driverId && date) m.set(`${driverId}|${date}`, leaveType);
  }
  return m;
}

/** Span (in day columns) of a load starting at column startIdx, clamped to the visible range. */
function loadSpan(load: PlannerLoadEvent, days: string[], startIdx: number): number {
  const startDay = toDayKey(load.start_at);
  const endDay = toDayKey(load.end_at) ?? startDay;
  if (!startDay) return 1;
  let lastIdx = startIdx;
  for (let i = startIdx; i < days.length; i++) {
    if (days[i] >= startDay && days[i] <= (endDay ?? startDay)) lastIdx = i;
  }
  return Math.max(1, lastIdx - startIdx + 1);
}

function dayCoveredByLoad(load: PlannerLoadEvent, day: string): boolean {
  const startDay = toDayKey(load.start_at);
  const endDay = toDayKey(load.end_at) ?? startDay;
  if (!startDay) return false;
  return day >= startDay && day <= (endDay ?? startDay);
}

function utilPct(loads: PlannerLoadEvent[], days: string[]): number {
  if (days.length === 0) return 0;
  let covered = 0;
  for (const day of days) {
    if (loads.some((load) => dayCoveredByLoad(load, day))) covered += 1;
  }
  return Math.round((covered / days.length) * 100);
}

const LOAD_HATCH =
  "bg-[repeating-linear-gradient(-45deg,#cbd5e1,#cbd5e1_3px,#e2e8f0_3px,#e2e8f0_6px)]";
const DWELL_HATCH =
  "bg-[repeating-linear-gradient(45deg,#e2e8f0,#e2e8f0_3px,#f8fafc_3px,#f8fafc_6px)]";

function StatusPill({ status }: { status: "Available" | "On-load" | "On-leave" | "Unknown" }) {
  // §7-safe — slate only (no green/blue). On-leave gets the single allowed amber accent.
  const cls =
    status === "On-leave"
      ? "bg-[#fdf3e7] text-[#854F0B]"
      : status === "On-load"
        ? "bg-slate-200 text-slate-800"
        : "bg-slate-100 text-slate-500";
  return <span className={`rounded-sm px-1.5 py-0.5 text-[10px] font-semibold ${cls}`}>{status}</span>;
}

export function UnifiedTimelinePlanner() {
  const { selectedCompanyId } = useCompanyContext();
  const operatingCompanyId = selectedCompanyId ?? "";
  const { range, days } = usePlannerRange();
  // DB-7 Phase 2: idle "+ Book" opens the Book Load wizard PREFILLED to that truck — same in-page modal
  // pattern Dispatch.tsx uses (BookLoadModalV4 + prefillUnitId), not a URL param. unit_id comes from the
  // planner feed (PlannerDriverRow.unit_id).
  const [bookUnitId, setBookUnitId] = useState<string | null>(null);
  const [bookOpen, setBookOpen] = useState(false);
  const closeBook = () => {
    setBookOpen(false);
    setBookUnitId(null);
  };

  const timelineQuery = useQuery({
    queryKey: ["dispatch", "planners", "timeline", operatingCompanyId, range.start, range.end],
    enabled: Boolean(operatingCompanyId),
    queryFn: () => fetchTimelineForRange(operatingCompanyId, range.start, range.end),
  });

  // Leave/availability overlay (the "both layered" half) — best-effort; the timeline still renders if it fails.
  const leaveQuery = useQuery({
    queryKey: ["dispatch", "planners", "timeline-leave", operatingCompanyId, range.start, range.end],
    enabled: Boolean(operatingCompanyId),
    queryFn: () => driverSchedulerOfficeApi.getGrid(operatingCompanyId, range.start, range.end),
  });

  const drivers = useMemo(() => {
    const list = [...(timelineQuery.data?.drivers ?? [])];
    list.sort((a, b) => {
      const ao = a.hos_status === "violation" ? 1 : 0;
      const bo = b.hos_status === "violation" ? 1 : 0;
      return ao - bo;
    });
    return list;
  }, [timelineQuery.data]);
  const loadsByDriver = useMemo(() => {
    const m = new Map<string, PlannerLoadEvent[]>();
    for (const load of timelineQuery.data?.loads ?? []) {
      if (!load.driver_id) continue;
      m.set(load.driver_id, [...(m.get(load.driver_id) ?? []), load]);
    }
    return m;
  }, [timelineQuery.data]);
  const leaveByCell = useMemo(() => parseLeaveCells(leaveQuery.data?.leave_day_cells), [leaveQuery.data]);

  const openBookForUnit = (unitId: string | null | undefined) => {
    setBookUnitId(unitId ?? null);
    setBookOpen(true);
  };

  const driverHasLeave = useMemo(() => {
    const s = new Set<string>();
    for (const key of leaveByCell.keys()) s.add(key.split("|")[0]);
    return s;
  }, [leaveByCell]);

  const statusFor = (driver: PlannerDriverRow): "Available" | "On-load" | "On-leave" | "Unknown" => {
    if ((loadsByDriver.get(driver.id)?.length ?? 0) > 0) return "On-load";
    if (leaveQuery.isError) return "Unknown";
    if (driverHasLeave.has(driver.id)) return "On-leave";
    return "Available";
  };

  if (!operatingCompanyId) {
    return (
      <div
        data-testid="dispatch-timeline-need-company"
        className="rounded-sm border bg-white p-4 text-sm text-slate-600"
      >
        Select an operating company to load the unified timeline planner.
      </div>
    );
  }

  if (timelineQuery.isLoading) return <div className="text-sm text-gray-500">Loading timeline…</div>;
  if (timelineQuery.isError) {
    return (
      <ListErrorBanner
        message={userFacingApiError(timelineQuery.error, "Could not load planner timeline")}
        onRetry={() => void timelineQuery.refetch()}
      />
    );
  }

  return (
    <div data-testid="dispatch-unified-timeline-page" className="space-y-2">
      {leaveQuery.isError ? (
        <ListErrorBanner
          message={userFacingApiError(leaveQuery.error, "Could not load driver leave and availability")}
          onRetry={() => void leaveQuery.refetch()}
        />
      ) : null}
      <div className="max-w-[calc(100vw-48px)] overflow-x-auto rounded-sm border border-gray-200 bg-white">
        <table className="min-w-max border-collapse text-[10px]">
          <PlannerAxisHead
            days={days}
            frozenColSpan={3}
            frozenDayCells={
              <>
                <th className={plannerFrozenThClass(true)}>Driver / Unit</th>
                <th className={plannerFrozenThClass()}>Util</th>
                <th className={plannerFrozenThClass()}>Book</th>
              </>
            }
          />
          <tbody>
            {drivers.length === 0 ? (
              <tr>
                <td
                  colSpan={3 + days.length}
                  data-testid="dispatch-timeline-honest-empty"
                  className="px-3 py-4 text-center text-sm text-gray-500"
                >
                  No drivers in this range for this company. Active drivers from the dispatch planner week feed
                  appear as rows; book loads or assign drivers to populate the timeline.
                </td>
              </tr>
            ) : (
              drivers.map((driver, driverIdx) => {
                const status = statusFor(driver);
                const sorted = [...(loadsByDriver.get(driver.id) ?? [])].sort((a, b) =>
                  String(a.start_at).localeCompare(String(b.start_at))
                );
                const pct = utilPct(sorted, days);
                const today = todayYmdAmericaChicago();
                const cells: ReactNode[] = [];
                let dayIdx = 0;
                let availableHint = false;
                const rangeStart = days[0];
                const rangeEnd = days[days.length - 1];
                while (dayIdx < days.length) {
                  const day = days[dayIdx];
                  const load = sorted.find((l) => toDayKey(l.start_at) === day);
                  if (load) {
                    const span = loadSpan(load, days, dayIdx);
                    const startDay = toDayKey(load.start_at);
                    const endDay = toDayKey(load.end_at) ?? startDay;
                    const contL = Boolean(startDay && rangeStart && startDay < rangeStart);
                    const contR = Boolean(endDay && rangeEnd && endDay > rangeEnd);
                    const lane = [load.pickup_city, load.pickup_state].filter(Boolean).join(", ");
                    cells.push(
                      <td
                        key={`${driver.id}-${day}`}
                        colSpan={span}
                        className={`${plannerDayBodyClass(day, today, contL || contR ? LOAD_HATCH : "bg-slate-100")} px-1`}
                      >
                        <span className="mr-0.5 rounded-sm bg-slate-700 px-0.5 text-[8px] font-semibold uppercase text-white">
                          {contL ? "◀" : ""}
                          {String(load.status).slice(0, 4)}
                          {contR ? "▶" : ""}
                        </span>
                        <EntityLink
                          kind="load"
                          id={load.id}
                          label={entityLabel(load.load_number, load.id, "Load")}
                          className="w-full truncate text-[9px] font-medium text-slate-700 hover:underline"
                          data-testid={`timeline-load-${load.id}`}
                        />
                        {lane ? <span className="block truncate text-[8px] text-slate-500">{lane}</span> : null}
                        <span className="block text-[9px]">
                          <EntityLinkOrTombstone kind="customer" id={load.customer_id} name={load.customer_name} noun="Customer" />
                        </span>
                      </td>
                    );
                    dayIdx += span;
                    const next = sorted.find((l) => String(l.start_at) > String(load.start_at));
                    const nextStart = next ? toDayKey(next.start_at) : null;
                    if (next && nextStart && dayIdx < days.length && days[dayIdx] < nextStart) {
                      let dwell = 0;
                      while (dayIdx + dwell < days.length && days[dayIdx + dwell] < nextStart) dwell += 1;
                      if (dwell > 0) {
                        cells.push(
                          <td
                            key={`${driver.id}-dwell-${days[dayIdx]}`}
                            colSpan={dwell}
                            className={`${plannerDayBodyClass(days[dayIdx], today, DWELL_HATCH)} text-[8px] italic text-slate-500`}
                            data-testid={`timeline-dwell-${driver.id}`}
                          >
                            {formatPlannerDwell(load.end_at ?? load.start_at, next.start_at) || "dwell"}
                          </td>
                        );
                        dayIdx += dwell;
                      }
                    }
                  } else {
                    const leaveType = leaveByCell.get(`${driver.id}|${day}`);
                    const showAvail = status === "Available" && !leaveType && !availableHint;
                    if (showAvail) availableHint = true;
                    cells.push(
                      <td
                        key={`${driver.id}-${day}`}
                        className={plannerDayBodyClass(day, today, leaveType ? "bg-slate-100" : "")}
                        title={leaveType ?? ""}
                      >
                        {leaveType ? (
                          <span className="text-[9px] text-[#854F0B]">{leaveType.slice(0, 3)}</span>
                        ) : showAvail ? (
                          <span className="text-[8px] italic text-slate-400">Available</span>
                        ) : null}
                      </td>
                    );
                    dayIdx += 1;
                  }
                }
                const oosBanner =
                  driver.hos_status === "violation" &&
                  (driverIdx === 0 || drivers[driverIdx - 1]?.hos_status !== "violation");
                return (
                  <Fragment key={driver.id}>
                    {oosBanner ? (
                      <tr data-testid="planner-oos-group">
                        <td colSpan={3 + days.length} className="bg-slate-200 px-2 py-0.5 text-[9px] font-semibold text-slate-700">
                          Out of service
                        </td>
                      </tr>
                    ) : null}
                    <tr className="h-[34px] border-t border-gray-100">
                      <td className="sticky left-0 z-10 border-r-2 border-slate-400 bg-white px-2 py-0.5 text-xs font-medium text-gray-900">
                        <EntityLink kind="driver" id={driver.id} label={entityLabel(driver.name, driver.id, "Driver")} />
                        <span className="ml-1 text-[10px] text-gray-500">
                          <EntityLinkOrTombstone kind="unit" id={driver.unit_id} name={driver.unit_number} noun="Unit" />
                        </span>
                        <span className="ml-1"><StatusPill status={status} /></span>
                      </td>
                      <td className="border-r-2 border-slate-400 px-1 py-0.5" data-testid={`timeline-util-${driver.id}`}>
                        <div className="h-1.5 w-12 overflow-hidden rounded-sm bg-slate-200">
                          <div className="h-full bg-slate-600" style={{ width: `${pct}%` }} />
                        </div>
                        <span className="text-[8px] text-slate-600">{pct}%</span>
                      </td>
                      <td className="border-r-2 border-slate-400 px-1 py-0.5 text-center">
                        {status === "Available" ? (
                          <button
                            type="button"
                            data-testid={`timeline-book-${driver.id}`}
                            onClick={() => openBookForUnit(driver.unit_id)}
                            className="rounded-sm bg-slate-800 px-1.5 py-0.5 text-[9px] font-semibold text-white"
                          >
                            + Book
                          </button>
                        ) : null}
                      </td>
                      {cells}
                    </tr>
                  </Fragment>
                );
              })
            )}
          </tbody>
        </table>
      </div>
      {bookOpen ? (
        <BookLoadModalV4
          open={bookOpen}
          operatingCompanyId={operatingCompanyId}
          prefillUnitId={bookUnitId}
          // PlannerDriverRow.id is the canonical driver FK; the row has no driver_id property.
          prefillDriverId={drivers.find((driver) => driver.unit_id === bookUnitId)?.id ?? null}
          onClose={closeBook}
          onCreated={() => {
            closeBook();
            void timelineQuery.refetch();
          }}
        />
      ) : null}
    </div>
  );
}
