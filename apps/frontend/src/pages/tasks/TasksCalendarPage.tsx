import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "../../components/layout/PageHeader";
import { TasksModuleTabs } from "./TasksModuleTabs";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { fetchPlannerTasks, type Task } from "../../api/tasks";
import { addDaysIso, companyToday, monthBoundsIso } from "../../lib/businessDate";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const PRIORITY_DOT = ["bg-slate-400", "bg-orange-500", "bg-red-600"];

function monthLabel(iso: string): string {
  const [y, m] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
}

// TASK-1: Calendar — month grid of tasks by scheduled_date (was an unbuilt placeholder). Reads the
// existing /api/v1/tasks/planner endpoint over the visible month range.
export function TasksCalendarPage() {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const [anchor, setAnchor] = useState(() => companyToday()); // any date within the shown month
  const bounds = useMemo(() => monthBoundsIso(anchor), [anchor]);
  const today = companyToday();

  const query = useQuery({
    queryKey: ["tasks", "calendar", companyId, bounds.start, bounds.end],
    queryFn: () => fetchPlannerTasks({ operating_company_id: companyId, date_from: bounds.start, date_to: bounds.end }),
    enabled: Boolean(companyId),
  });

  const tasksByDay = useMemo(() => {
    const map = new Map<string, Task[]>();
    for (const t of query.data?.tasks ?? []) {
      const key = t.scheduled_date.slice(0, 10);
      const list = map.get(key) ?? [];
      list.push(t);
      map.set(key, list);
    }
    return map;
  }, [query.data?.tasks]);

  // Build the calendar cells: leading blanks for the first weekday, then each day of the month.
  const cells = useMemo(() => {
    const [y, m] = bounds.start.split("-").map(Number);
    const firstWeekday = new Date(Date.UTC(y, m - 1, 1)).getUTCDay();
    const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const out: Array<string | null> = [];
    for (let i = 0; i < firstWeekday; i++) out.push(null);
    for (let d = 1; d <= daysInMonth; d++) out.push(`${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`);
    return out;
  }, [bounds.start]);

  const shiftMonth = (dir: number) => setAnchor((cur) => addDaysIso(monthBoundsIso(cur).start, dir > 0 ? 32 : -1));

  return (
    <div className="space-y-4">
      <PageHeader title="Calendar" subtitle="Scheduled tasks by day" />
      <TasksModuleTabs />

      <div className="flex items-center justify-between rounded border border-slate-200 bg-white px-3 py-2">
        <button type="button" onClick={() => shiftMonth(-1)} className="rounded border border-slate-300 px-2 py-1 text-xs text-slate-700">
          ← Prev
        </button>
        <div className="text-sm font-semibold text-slate-900">{monthLabel(bounds.start)}</div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => setAnchor(today)} className="rounded border border-slate-300 px-2 py-1 text-xs text-slate-700">
            Today
          </button>
          <button type="button" onClick={() => shiftMonth(1)} className="rounded border border-slate-300 px-2 py-1 text-xs text-slate-700">
            Next →
          </button>
        </div>
      </div>

      {query.isError ? <div className="text-xs text-red-700">Couldn't load the calendar.</div> : null}

      <div className="rounded border border-slate-200 bg-white p-2">
        <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-semibold text-slate-500">
          {WEEKDAYS.map((d) => (
            <div key={d} className="py-1">{d}</div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {cells.map((day, idx) => {
            if (!day) return <div key={`blank-${idx}`} className="min-h-[84px] rounded bg-slate-50" />;
            const dayTasks = tasksByDay.get(day) ?? [];
            const isToday = day === today;
            return (
              <div
                key={day}
                className={`min-h-[84px] rounded border p-1 ${isToday ? "border-slate-800 bg-slate-50" : "border-slate-100"}`}
              >
                <div className={`text-[10px] ${isToday ? "font-bold text-slate-900" : "text-slate-500"}`}>{Number(day.slice(8, 10))}</div>
                <div className="mt-0.5 space-y-0.5">
                  {dayTasks.slice(0, 3).map((t) => (
                    <div key={t.task_id} className="flex items-center gap-1 truncate text-[9px] text-slate-700" title={t.title}>
                      <span className={`h-1.5 w-1.5 flex-shrink-0 rounded-full ${PRIORITY_DOT[Math.min(2, Math.max(0, t.priority))]}`} />
                      <span className={`truncate ${t.status === "completed" ? "text-slate-400 line-through" : ""}`}>{t.title}</span>
                    </div>
                  ))}
                  {dayTasks.length > 3 ? <div className="text-[9px] text-slate-400">+{dayTasks.length - 3} more</div> : null}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
