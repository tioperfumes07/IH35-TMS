import { useMemo, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { getDispatchPlannerWeek, type PlannerDriverRow, type PlannerLoadEvent } from "../../../api/dispatch";
import { driverSchedulerOfficeApi } from "../../../api/driver-scheduler";
import { useCompanyContext } from "../../../contexts/CompanyContext";
import { addDaysIso } from "./planner-range";
import { usePlannerRange } from "./PlannerRangeContext";

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

function StatusPill({ status }: { status: "Available" | "On-load" | "On-leave" }) {
  // §7-safe — slate only (no green/blue). On-leave gets the single allowed amber accent.
  const cls =
    status === "On-leave"
      ? "bg-[#fdf3e7] text-[#854F0B]"
      : status === "On-load"
        ? "bg-slate-200 text-slate-800"
        : "bg-slate-100 text-slate-500";
  return <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${cls}`}>{status}</span>;
}

export function UnifiedTimelinePlanner() {
  const navigate = useNavigate();
  const { selectedCompanyId } = useCompanyContext();
  const operatingCompanyId = selectedCompanyId ?? "";
  const { range, days } = usePlannerRange();

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

  const drivers = useMemo(() => timelineQuery.data?.drivers ?? [], [timelineQuery.data]);
  const loadsByDriver = useMemo(() => {
    const m = new Map<string, PlannerLoadEvent[]>();
    for (const load of timelineQuery.data?.loads ?? []) {
      if (!load.driver_id) continue;
      m.set(load.driver_id, [...(m.get(load.driver_id) ?? []), load]);
    }
    return m;
  }, [timelineQuery.data]);
  const leaveByCell = useMemo(() => parseLeaveCells(leaveQuery.data?.leave_day_cells), [leaveQuery.data]);

  const openLoad = (loadId: string) => navigate(`/dispatch?load_id=${encodeURIComponent(loadId)}`);
  const openBookForUnit = () => navigate(`/dispatch?view=kanban`);

  const driverHasLeave = useMemo(() => {
    const s = new Set<string>();
    for (const key of leaveByCell.keys()) s.add(key.split("|")[0]);
    return s;
  }, [leaveByCell]);

  const statusFor = (driver: PlannerDriverRow): "Available" | "On-load" | "On-leave" => {
    if ((loadsByDriver.get(driver.id)?.length ?? 0) > 0) return "On-load";
    if (driverHasLeave.has(driver.id)) return "On-leave";
    return "Available";
  };

  if (timelineQuery.isLoading) return <div className="text-sm text-gray-500">Loading timeline…</div>;
  if (timelineQuery.isError) return <div className="text-sm text-red-700">Failed to load planner timeline.</div>;

  return (
    <div data-testid="dispatch-unified-timeline-page" className="space-y-2">
      <div className="max-w-[calc(100vw-48px)] overflow-x-auto rounded border border-gray-200 bg-white">
        <table className="min-w-max border-collapse text-[10px]">
          <thead>
            <tr>
              <th className="sticky left-0 z-10 border-b border-r bg-gray-50 px-2 py-1 text-left">Driver / Unit</th>
              <th className="border-b border-r bg-gray-50 px-1 py-1 text-left">Status</th>
              {days.map((d) => (
                <th key={d} className="border-b border-gray-100 px-0.5 py-1 text-center font-normal text-gray-500">
                  {d.slice(5)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {drivers.length === 0 ? (
              <tr>
                <td colSpan={2 + days.length} className="px-3 py-4 text-center text-sm text-gray-500">
                  No drivers in this range.
                </td>
              </tr>
            ) : (
              drivers.map((driver) => {
                const status = statusFor(driver);
                const sorted = [...(loadsByDriver.get(driver.id) ?? [])].sort((a, b) =>
                  String(a.start_at).localeCompare(String(b.start_at))
                );
                const cells: ReactNode[] = [];
                let dayIdx = 0;
                while (dayIdx < days.length) {
                  const day = days[dayIdx];
                  const load = sorted.find((l) => toDayKey(l.start_at) === day);
                  if (load) {
                    const span = loadSpan(load, days, dayIdx);
                    cells.push(
                      <td key={`${driver.id}-${day}`} colSpan={span} className="border-l border-gray-50 bg-slate-100 px-1 py-0.5 text-center">
                        <button
                          type="button"
                          className="w-full truncate text-[9px] font-medium text-slate-700 hover:underline"
                          data-testid={`timeline-load-${load.load_number}`}
                          onClick={() => openLoad(load.id)}
                          title={`${load.load_number} · ${load.customer_name ?? ""} · ${load.status}`}
                        >
                          {load.load_number}
                        </button>
                      </td>
                    );
                    dayIdx += span;
                  } else {
                    const leaveType = leaveByCell.get(`${driver.id}|${day}`);
                    cells.push(
                      <td
                        key={`${driver.id}-${day}`}
                        className={`border-l border-gray-50 px-0 py-0 text-center ${leaveType ? "bg-[#fdf3e7]" : "bg-white"}`}
                        title={leaveType ?? ""}
                      >
                        {leaveType ? <span className="text-[9px] text-[#854F0B]">{leaveType.slice(0, 3)}</span> : null}
                      </td>
                    );
                    dayIdx += 1;
                  }
                }
                return (
                  <tr key={driver.id} className="border-t border-gray-100">
                    <td className="sticky left-0 z-10 border-r bg-white px-2 py-0.5 text-xs font-medium text-gray-900">
                      <span>{driver.name}</span>
                      <span className="ml-1 text-[10px] text-gray-500">{driver.unit_number ?? "—"}</span>
                      {status === "Available" ? (
                        <button
                          type="button"
                          data-testid={`timeline-book-${driver.id}`}
                          onClick={openBookForUnit}
                          className="ml-2 rounded bg-[#1F2A44] px-1.5 py-0.5 text-[9px] font-semibold text-white"
                        >
                          + Book
                        </button>
                      ) : null}
                    </td>
                    <td className="border-r px-1 py-0.5"><StatusPill status={status} /></td>
                    {cells}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
