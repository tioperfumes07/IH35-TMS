import { DndContext, type DragEndEvent, useDraggable, useDroppable } from "@dnd-kit/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  getDispatchPlannerWeek,
  patchDispatchPlannerLoadStartAt,
  type PlannerDriverRow,
  type PlannerLoadEvent,
} from "../../api/dispatch";
import { PageHeader } from "../../components/layout/PageHeader";
import { useToast } from "../../components/Toast";
import { useCompanyContext } from "../../contexts/CompanyContext";

function dayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function parseWeekStart(input?: string): Date {
  if (input) {
    const parsed = new Date(`${input}T00:00:00.000Z`);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  const now = new Date();
  const day = now.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + diff));
}

function hosClass(status: PlannerDriverRow["hos_status"]): string {
  if (status === "violation") return "bg-red-100 text-red-700";
  if (status === "warning_15min" || status === "warning_1hr") return "bg-amber-100 text-amber-700";
  return "bg-emerald-100 text-emerald-700";
}

function PlannerLoadChip({ load }: { load: PlannerLoadEvent }) {
  const navigate = useNavigate();
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: load.id, data: { load } });
  const style = transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` } : undefined;
  return (
    <button
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      type="button"
      data-testid={`planner-load-${load.load_number}`}
      className={`mb-1 block w-full rounded border border-slate-300 bg-slate-100 px-2 py-1 text-left text-[11px] text-slate-700 ${isDragging ? "opacity-60" : ""}`}
      title={`${load.customer_name ?? "Load"} · ${load.pickup_city ?? ""}${load.pickup_state ? `, ${load.pickup_state}` : ""} — click to open detail`}
      onClick={() => navigate(`/dispatch?load_id=${encodeURIComponent(load.id)}`)}
    >
      <span className="font-semibold">{load.load_number}</span>
      <span className="block truncate text-[10px] text-slate-700">{load.customer_name ?? "—"}</span>
    </button>
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
          className="mb-1 rounded bg-slate-200/80 px-1 py-0.5 text-[10px] text-slate-600"
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
  const [weekStart, setWeekStart] = useState(() => dayKey(parseWeekStart()));
  const [showHosOverlay, setShowHosOverlay] = useState(true);

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
    const start = parseWeekStart(weekStart);
    return Array.from({ length: 7 }, (_, index) => dayKey(addDays(start, index)));
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
    if (!load || !target?.driverId || !target.day || !companyId) return;
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
    return <div className="rounded border bg-white p-4 text-sm text-slate-600">Select an operating company.</div>;
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
              className="rounded border px-3 py-1.5 text-sm"
              onClick={() => setWeekStart(dayKey(addDays(parseWeekStart(weekStart), -7)))}
            >
              Previous week
            </button>
            <button
              type="button"
              className="rounded border px-3 py-1.5 text-sm"
              onClick={() => setWeekStart(dayKey(addDays(parseWeekStart(weekStart), 7)))}
            >
              Next week
            </button>
            <label className="flex items-center gap-2 rounded border px-3 py-1.5 text-sm">
              <input
                type="checkbox"
                checked={showHosOverlay}
                onChange={(event) => setShowHosOverlay(event.target.checked)}
              />
              HOS overlay
            </label>
            <Link to="/dispatch" className="rounded border px-3 py-1.5 text-sm">
              Dispatch Home
            </Link>
          </div>
        }
      />

      <section className="overflow-x-auto rounded border bg-white">
        {weekQ.isLoading ? (
          <div className="p-6 text-center text-sm text-slate-500">Loading planner week…</div>
        ) : (
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
                    <td colSpan={8} className="px-3 py-6 text-center text-slate-500">
                      No active drivers for this company.
                    </td>
                  </tr>
                ) : (
                  drivers.map((driver) => (
                    <tr key={driver.id}>
                      <td className="sticky left-0 z-10 border-b bg-white px-3 py-2">
                        <div className="font-medium">{driver.name}</div>
                        <div className="text-xs text-slate-500">{driver.unit_number ?? "No unit"}</div>
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
