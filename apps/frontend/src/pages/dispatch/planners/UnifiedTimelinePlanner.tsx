import { useMemo, useState } from "react";
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
import { PlannerAxisHead } from "./PlannerAxisHead";
import { formatPlannerDwell } from "./plannerTimeAxis";
import { dwellsFromDayMap, PlannerGrid, type PlannerGridRow } from "./PlannerGrid";

void PlannerAxisHead;

function toDayKey(iso: string | null | undefined): string | null {
  return iso ? iso.slice(0, 10) : null;
}

async function fetchTimelineForRange(
  operatingCompanyId: string,
  rangeStart: string,
  rangeEnd: string
): Promise<{ drivers: PlannerDriverRow[]; loads: PlannerLoadEvent[] }> {
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

function LoadCustomerLink({ load }: { load: PlannerLoadEvent }) {
  return <EntityLinkOrTombstone kind="customer" id={load.customer_id} name={load.customer_name} noun="Customer" />;
}

function StatusPill({ status }: { status: "Available" | "On-load" | "On-leave" | "Unknown" }) {
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

  const toRows = (list: PlannerDriverRow[]): PlannerGridRow[] =>
    list.map((driver) => {
      const status = statusFor(driver);
      const sorted = [...(loadsByDriver.get(driver.id) ?? [])].sort((a, b) =>
        String(a.start_at).localeCompare(String(b.start_at))
      );
      const pct = utilPct(sorted, days);
      const dwells = dwellsFromDayMap(days, (d) => leaveByCell.get(`${driver.id}|${d}`), `leave-${driver.id}`);
      for (let i = 0; i < sorted.length - 1; i += 1) {
        const load = sorted[i];
        const next = sorted[i + 1];
        const end = load.end_at ?? load.start_at;
        if (String(next.start_at) <= String(end)) continue;
        const label = formatPlannerDwell(end, next.start_at);
        dwells.push({
          id: `dwell-${load.id}`,
          startYmd: toDayKey(end) ?? days[0],
          endYmd: toDayKey(next.start_at) ?? days[days.length - 1],
          label: label ? `${label} idle` : "idle",
        });
      }
      return {
        id: driver.id,
        idle: status === "Available",
        name: (
          <>
            <EntityLink kind="driver" id={driver.id} label={entityLabel(driver.name, driver.id, "Driver")} />
            <span className="text-[10px] font-medium text-gray-500">
              <EntityLinkOrTombstone kind="unit" id={driver.unit_id} name={driver.unit_number} noun="Unit" />
            </span>
            <StatusPill status={status} />
            <span data-testid={`timeline-util-${driver.id}`} className="text-[8px] font-medium text-slate-600">
              {pct}%
            </span>
            {sorted[0] ? (
              <span className="text-[10px] font-medium text-gray-500">
                <LoadCustomerLink load={sorted[0]} />
              </span>
            ) : null}
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
          </>
        ),
        dwells,
        bars: sorted.map((load) => ({
          id: load.id,
          label: entityLabel(load.load_number, load.id, "Load"),
          startYmd: toDayKey(load.start_at) ?? days[0],
          endYmd: toDayKey(load.end_at) ?? toDayKey(load.start_at) ?? days[0],
          kind: "nb" as const,
          testId: `timeline-load-${load.id}`,
        })),
      };
    });

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

  const inService = drivers.filter((d) => d.hos_status !== "violation");
  const oos = drivers.filter((d) => d.hos_status === "violation");

  return (
    <div data-testid="dispatch-unified-timeline-page" className="space-y-2 [&_.pg-r]:h-[34px]">
      {leaveQuery.isError ? (
        <ListErrorBanner
          message={userFacingApiError(leaveQuery.error, "Could not load driver leave and availability")}
          onRetry={() => void leaveQuery.refetch()}
        />
      ) : null}
      <PlannerGrid
        days={days}
        frozenLabel="Driver / Unit"
        frozenPx={320}
        rows={toRows(inService)}
        empty={
          <span data-testid="dispatch-timeline-honest-empty">
            No drivers in this range for this company. Active drivers from the dispatch planner week feed appear as
            rows; book loads or assign drivers to populate the timeline.
          </span>
        }
      />
      {oos.length > 0 ? (
        <div className="mt-3" data-testid="planner-oos-group">
          <PlannerGrid
            days={days}
            frozenLabel="Out of service"
            frozenPx={320}
            rows={toRows(oos)}
            empty={null}
          />
        </div>
      ) : null}
      {bookOpen ? (
        <BookLoadModalV4
          open={bookOpen}
          operatingCompanyId={operatingCompanyId}
          prefillUnitId={bookUnitId}
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
