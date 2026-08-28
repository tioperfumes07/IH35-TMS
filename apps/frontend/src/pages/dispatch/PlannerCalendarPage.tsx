import { DndContext, type DragEndEvent, useDraggable, useDroppable } from "@dnd-kit/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  getDispatchPlannerWeek,
  patchDispatchPlannerLoadStartAt,
  type PlannerDriverRow,
  type PlannerLoadEvent,
} from "../../api/dispatch";
import { PageHeader } from "../../components/layout/PageHeader";
import { ListErrorBanner } from "../../components/shared/ListErrorBanner";
import { useToast } from "../../components/Toast";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { userFacingApiError } from "../../lib/api-error-message";
import { LoadTemplateLibrary } from "./LoadTemplateLibrary";
import { entityLabel } from "../../lib/entity-label";
import { EntityLink } from "../../components/shared/EntityLink";
import { EntityLinkOrTombstone } from "../../components/shared/EntityLinkOrTombstone";
import { addDaysIso, companyToday } from "../../lib/businessDate";

function plannerWeekStart(input?: string): string {
  if (input && /^\d{4}-\d{2}-\d{2}$/.test(input)) return input;
  const today = companyToday();
  const [year, month, day] = today.split("-").map(Number);
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return addDaysIso(today, weekday === 0 ? -6 : 1 - weekday);
}

function hosClass(status: PlannerDriverRow["hos_status"]): string {
  if (status === "violation") return "bg-red-100 text-red-700";
  if (status === "warning_15min" || status === "warning_1hr") return "bg-slate-100 text-slate-700";
  return "bg-slate-100 text-slate-700";
}

function PlannerLoadChip({ load }: { load: PlannerLoadEvent }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: load.id, data: { load } });
  const style = transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` } : undefined;
  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      data-testid={`planner-load-${load.load_number}`}
      className={`mb-1 block w-full rounded-sm border border-slate-300 bg-slate-100 px-2 py-1 text-left text-[11px] text-slate-700 ${isDragging ? "opacity-60" : ""}`}
      title={`${entityLabel(load.load_number, load.id, "Load")} · ${entityLabel(load.customer_name, load.customer_id, "Customer")} · ${load.pickup_city ?? ""}${load.pickup_state ? `, ${load.pickup_state}` : ""} — click to open detail`}
    >
      <EntityLink kind="load" id={load.id} label={entityLabel(load.load_number, load.id, "Load")} className="font-semibold" data-testid="planner-calendar-load-link" />
      <span className="block truncate text-[10px] text-slate-700">
        <EntityLinkOrTombstone kind="customer" id={load.customer_id} name={load.customer_name} noun="Customer" data-testid="planner-calendar-customer-link" />
      </span>
    </div>
  );
}

function PlannerDayCell({
  driverId,
  day,
  loads,
  blackouts,
  showHosOverlay,
}: {
  driverId: string;
  day: string;
  loads: PlannerLoadEvent[];
  blackouts: PlannerDriverRow["blackouts"];
  showHosOverlay: boolean;
}) {
  const droppableId = `${driverId}:${day}`;
  const { setNodeRef, isOver } = useDroppable({ id: droppableId, data: { driverId, day } });
  const dayStart = new Date(`${day}T00:00:00.000Z`).getTime();
  const dayEnd = dayStart + 24 * 60 * 60 * 1000;
  const dayBlackouts = blackouts.filter((slot) => {
    const start = new Date(slot.start_at).getTime();
    const end = new Date(slot.end_at).getTime();
    return start < dayEnd && end > dayStart;
  });

  return (
    <td
      ref={setNodeRef}
      data-testid={`planner-cell-${driverId}-${day}`}
      className={`min-w-[120px] border-b border-r align-top p-1 ${isOver ? "bg-slate-100" : "bg-white"}`}
    >
      {showHosOverlay && dayBlackouts.length > 0 ? (
        <div
          data-testid={`planner-hos-overlay-${driverId}-${day}`}
          className="mb-1 rounded-sm bg-slate-200/80 px-1 py-0.5 text-[10px] text-slate-600"
          title={dayBlackouts.map((slot) => `${slot.reason} ${slot.start_at}`).join(" · ")}
        >
          HOS rest
        </div>
      ) : null}
      {loads.map((load) => (
        <PlannerLoadChip key={load.id} load={load} />
      ))}
    </td>
  );
}

export function PlannerCalendarPage() {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const queryClient = useQueryClient();
  const { pushToast } = useToast();
  const [weekStart, setWeekStart] = useState(() => plannerWeekStart());
  const [showHosOverlay, setShowHosOverlay] = useState(true);
  // Load Templates library — openable from the Dispatch subnav deep-link (?panel=templates) and the
  // header button. Previously the subnav "Load Templates" link landed here with no template UI (dead nav).
  const [searchParams, setSearchParams] = useSearchParams();
  const templatesOpen = searchParams.get("panel") === "templates";
  const openTemplates = () => {
    const next = new URLSearchParams(searchParams);
    next.set("panel", "templates");
    setSearchParams(next, { replace: true });
  };
  const closeTemplates = () => {
    const next = new URLSearchParams(searchParams);
    next.delete("panel");
    setSearchParams(next, { replace: true });
  };

  const weekQ = useQuery({
    queryKey: ["dispatch", "planner-week", companyId, weekStart],
    queryFn: () => getDispatchPlannerWeek(companyId, weekStart),
    enabled: Boolean(companyId),
  });

  const rescheduleM = useMutation({
    mutationFn: (input: { loadId: string; startAt: string; driverId: string }) =>
      patchDispatchPlannerLoadStartAt(input.loadId, {
        operating_company_id: companyId,
        start_at: input.startAt,
        driver_id: input.driverId,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["dispatch", "planner-week", companyId] });
    },
  });

  const days = useMemo(() => {
    return Array.from({ length: 7 }, (_, index) => addDaysIso(weekStart, index));
  }, [weekStart]);

  const loadsByDriverDay = useMemo(() => {
    const map = new Map<string, PlannerLoadEvent[]>();
    for (const load of weekQ.data?.loads ?? []) {
      const day = load.start_at.slice(0, 10);
      const key = `${load.driver_id}:${day}`;
      map.set(key, [...(map.get(key) ?? []), load]);
    }
    return map;
  }, [weekQ.data?.loads]);

  const handleDragEnd = async (event: DragEndEvent) => {
    const load = event.active.data.current?.load as PlannerLoadEvent | undefined;
    const target = event.over?.data.current as { driverId?: string; day?: string } | undefined;
    // Two different situations shared one bare return, so a drop onto a REAL cell that could not be
    // resolved vanished with no request, no toast and no reason. Keep them apart:
    // (a) released outside any day cell — `event.over` is null. An EXPECTED no-op; stay silent.
    if (!target?.driverId || !target.day) return;
    // (b) released ON a real driver/day cell but the dragged load or the company could not be
    //     resolved. That is a bug state, not a user action, so it must not disappear silently.
    if (!load || !companyId) {
      pushToast("Could not reschedule that load — the planner could not identify it. Refresh and try again.", "error");
      return;
    }
    const nextStartAt = `${target.day}T${load.start_at.slice(11)}`;
    try {
      await rescheduleM.mutateAsync({ loadId: load.id, startAt: nextStartAt, driverId: target.driverId });
      pushToast(`Rescheduled ${load.load_number}`, "success");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Reschedule rejected";
      pushToast(message.includes("409") ? "Conflict blocked — driver already has a nearby load" : message, "error");
    }
  };

  if (!companyId) {
    return (
      <div
        data-testid="dispatch-planner-need-company"
        className="rounded-sm border bg-white p-4 text-sm text-slate-600"
      >
        Select an operating company to load the planner calendar.
      </div>
    );
  }

  const drivers = weekQ.data?.drivers ?? [];

  return (
    <div data-testid="dispatch-planner-calendar-page" className="mx-auto max-w-[1400px] space-y-4">
      <PageHeader
        title="Planner Calendar"
        subtitle="Week-at-a-glance driver rows with drag-drop reschedule and HOS overlay"
        actions={
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="rounded-sm border px-3 py-1.5 text-sm"
              onClick={() => setWeekStart(addDaysIso(weekStart, -7))}
            >
              Previous week
            </button>
            <button
              type="button"
              className="rounded-sm border px-3 py-1.5 text-sm"
              onClick={() => setWeekStart(addDaysIso(weekStart, 7))}
            >
              Next week
            </button>
            <label className="flex items-center gap-2 rounded-sm border px-3 py-1.5 text-sm">
              <input
                type="checkbox"
                checked={showHosOverlay}
                onChange={(event) => setShowHosOverlay(event.target.checked)}
              />
              HOS overlay
            </label>
            <button
              type="button"
              className="rounded-sm border px-3 py-1.5 text-sm"
              onClick={openTemplates}
            >
              Load Templates
            </button>
            <Link to="/dispatch" className="rounded-sm border px-3 py-1.5 text-sm">
              Dispatch Home
            </Link>
          </div>
        }
      />

      <LoadTemplateLibrary open={templatesOpen} onClose={closeTemplates} operatingCompanyId={companyId} />

      {weekQ.isError ? (
        <ListErrorBanner
          message={userFacingApiError(weekQ.error, "Could not load planner week")}
          onRetry={() => void weekQ.refetch()}
        />
      ) : null}

      <section className="overflow-x-auto rounded-sm border bg-white">
        {weekQ.isLoading ? (
          <div className="p-6 text-center text-sm text-slate-500">Loading planner week…</div>
        ) : weekQ.isError ? null : (
          <DndContext onDragEnd={handleDragEnd}>
            <table className="min-w-full text-sm">
              <thead className="border-b bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="sticky left-0 z-10 bg-slate-50 px-3 py-2">Driver / Unit</th>
                  {days.map((day) => (
                    <th key={day} className="px-3 py-2">
                      {new Date(`${day}T12:00:00.000Z`).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {drivers.length === 0 ? (
                  <tr>
                    <td
                      colSpan={8}
                      data-testid="dispatch-planner-honest-empty"
                      className="px-3 py-6 text-center text-slate-500"
                    >
                      No active drivers for this company this week. Assign drivers under Drivers / Lists, then
                      return here — load chips appear once loads have a start_at on a driver row.
                    </td>
                  </tr>
                ) : (
                  drivers.map((driver) => (
                    <tr key={driver.id}>
                      <td className="sticky left-0 z-10 border-b bg-white px-3 py-2">
                        <div className="font-medium"><EntityLink kind="driver" id={driver.id} label={entityLabel(driver.name, driver.id, "Driver")} /></div>
                        <div className="text-xs text-slate-500"><EntityLinkOrTombstone kind="unit" id={driver.unit_id ?? null} name={driver.unit_number} noun="Unit" /></div>
                        <span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold ${hosClass(driver.hos_status)}`}>
                          {driver.hos_status === "violation" ? "HOS VIOL" : driver.hos_status === "ok" ? "HOS OK" : "HOS WARN"}
                        </span>
                      </td>
                      {days.map((day) => (
                        <PlannerDayCell
                          key={`${driver.id}-${day}`}
                          driverId={driver.id}
                          day={day}
                          loads={loadsByDriverDay.get(`${driver.id}:${day}`) ?? []}
                          blackouts={driver.blackouts}
                          showHosOverlay={showHosOverlay}
                        />
                      ))}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </DndContext>
        )}
      </section>
    </div>
  );
}
