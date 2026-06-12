/**
 * TaskPlannerGrid — TASKS-PLANNER-REDESIGN-V3
 * Employee×day grid:
 * - Narrow day cols (~9%), gridlines, day-of-week headers
 * - ~27-30px rows, progress box on task blocks
 * - Multi-item stacked sub-rows per cell
 * - ~170px detail drawer (not full-page navigation)
 * - Shared UniversalFilterBar (QBO period presets + Custom)
 * - Resizable employee column (persisted via localStorage)
 */

import { useCallback, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  fetchPlannerTasks,
  type Task,
  type TaskStatus,
} from "../../api/tasks";
import { UniversalFilterBar, type FilterState } from "../../components/planner/UniversalFilterBar";
import { useCompanyContext } from "../../contexts/CompanyContext";

const STATUS_COLORS: Record<TaskStatus, string> = {
  pending:     "bg-gray-100 text-gray-700 border-gray-300",
  in_progress: "bg-blue-50 text-blue-800 border-blue-300",
  blocked:     "bg-red-50 text-red-800 border-red-300",
  review:      "bg-yellow-50 text-yellow-800 border-yellow-300",
  completed:   "bg-green-50 text-green-800 border-green-300",
  cancelled:   "bg-gray-50 text-gray-400 border-gray-200 line-through",
};

const PRIORITY_DOT: Record<number, string> = {
  0: "bg-gray-400",
  1: "bg-orange-500",
  2: "bg-red-600",
};

function buildDateRange(from: string, to: string): string[] {
  const dates: string[] = [];
  const cur = new Date(from);
  const end = new Date(to);
  while (cur <= end) {
    dates.push(cur.toISOString().split("T")[0]);
    cur.setDate(cur.getDate() + 1);
  }
  return dates;
}

function fmtDow(date: string) {
  const d = new Date(date + "T00:00:00");
  return d.toLocaleDateString("en-US", { weekday: "short" });
}

function fmtMD(date: string) {
  const d = new Date(date + "T00:00:00");
  return d.toLocaleDateString("en-US", { month: "numeric", day: "numeric" });
}

const LOCALSTORAGE_COL_KEY = "tasks_planner_employee_col_width";
const DEFAULT_EMPLOYEE_COL = 170;

function ProgressBar({ pct }: { pct: number }) {
  return (
    <div className="mt-0.5 flex items-center gap-1">
      <div className="relative h-1.5 flex-1 rounded-full bg-gray-200 overflow-hidden">
        <div
          className="h-full rounded-full bg-green-500 transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="w-6 text-right text-[9px] text-gray-500">{pct}%</span>
    </div>
  );
}

type DrawerProps = { task: Task; onClose: () => void };

function TaskDrawer({ task, onClose }: DrawerProps) {
  const statusLabel: Record<TaskStatus, string> = {
    pending: "Pending", in_progress: "In Progress", blocked: "Blocked",
    review: "Review", completed: "Completed", cancelled: "Cancelled",
  };
  return (
    <div className="flex h-full flex-col overflow-hidden" style={{ width: 170 }}>
      <div className="flex items-center justify-between border-b border-gray-200 px-3 py-2">
        <span className="text-xs font-semibold text-gray-800 truncate">{task.title}</span>
        <button type="button" onClick={onClose} className="ml-2 text-gray-400 hover:text-gray-600 text-xs">✕</button>
      </div>
      <div className="flex-1 overflow-y-auto px-3 py-2 space-y-2 text-xs">
        <div><span className="text-gray-500">Status: </span><span className={`inline-block rounded px-1 ${STATUS_COLORS[task.status]}`}>{statusLabel[task.status]}</span></div>
        {task.task_type_name && <div><span className="text-gray-500">Type: </span>{task.task_type_name}</div>}
        <div><span className="text-gray-500">Category: </span>{task.category}</div>
        <div><span className="text-gray-500">Date: </span>{task.scheduled_date}</div>
        {task.start_time && <div><span className="text-gray-500">Start: </span>{task.start_time}</div>}
        {task.location && <div><span className="text-gray-500">Location: </span>{task.location}</div>}
        {task.estimated_minutes != null && <div><span className="text-gray-500">Est: </span>{task.estimated_minutes}m</div>}
        {task.actual_minutes != null && <div><span className="text-gray-500">Actual: </span>{task.actual_minutes}m</div>}
        <div>
          <span className="text-gray-500">Progress: </span>
          <ProgressBar pct={task.progress_pct} />
        </div>
        {task.notes && (
          <div>
            <div className="text-gray-500 mb-0.5">Notes:</div>
            <div className="rounded border border-gray-100 bg-gray-50 p-1.5 text-gray-700 whitespace-pre-wrap">{task.notes}</div>
          </div>
        )}
      </div>
    </div>
  );
}

type TaskBlockProps = { task: Task; onClick: () => void };

function TaskBlock({ task, onClick }: TaskBlockProps) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => e.key === "Enter" && onClick()}
      className={`group cursor-pointer rounded border px-1.5 py-0.5 text-[10px] leading-tight mb-0.5 ${STATUS_COLORS[task.status]}`}
      style={{ minHeight: 27 }}
    >
      <div className="flex items-start gap-1">
        <span className={`mt-0.5 h-1.5 w-1.5 flex-shrink-0 rounded-full ${PRIORITY_DOT[task.priority] ?? PRIORITY_DOT[0]}`} />
        <span className="flex-1 truncate font-medium">{task.title}</span>
      </div>
      <ProgressBar pct={task.progress_pct} />
    </div>
  );
}

function getThisWeek(): { from: string; to: string } {
  const today = new Date();
  const start = new Date(today);
  start.setDate(today.getDate() - today.getDay());
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  const fmt = (d: Date) => d.toISOString().split("T")[0];
  return { from: fmt(start), to: fmt(end) };
}

export function TaskPlannerGrid() {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";

  const def = getThisWeek();
  const [filter, setFilter] = useState<FilterState>({ period: "this_week", from: def.from, to: def.to });
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);

  const [empColWidth, setEmpColWidth] = useState<number>(
    () => parseInt(localStorage.getItem(LOCALSTORAGE_COL_KEY) ?? String(DEFAULT_EMPLOYEE_COL), 10)
  );

  const isResizing = useRef(false);
  const resizeStartX = useRef(0);
  const resizeStartW = useRef(0);

  const onResizeMouseDown = useCallback((e: React.MouseEvent) => {
    isResizing.current = true;
    resizeStartX.current = e.clientX;
    resizeStartW.current = empColWidth;
    const onMove = (ev: MouseEvent) => {
      if (!isResizing.current) return;
      const delta = ev.clientX - resizeStartX.current;
      const next = Math.max(80, Math.min(300, resizeStartW.current + delta));
      setEmpColWidth(next);
      localStorage.setItem(LOCALSTORAGE_COL_KEY, String(next));
    };
    const onUp = () => { isResizing.current = false; window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }, [empColWidth]);

  const query = useQuery({
    queryKey: ["planner", companyId, filter.from, filter.to],
    queryFn: () => fetchPlannerTasks({ operating_company_id: companyId, date_from: filter.from, date_to: filter.to }),
    enabled: Boolean(companyId),
  });

  const dates = buildDateRange(filter.from, filter.to);
  const employees = query.data
    ? [...new Map(query.data.tasks.map((t) => [t.assigned_to_user_id, t.assigned_to_name ?? t.assigned_to_email ?? t.assigned_to_user_id])).entries()]
    : [];

  const dayColPct = dates.length > 0 ? Math.floor(80 / dates.length) : 9;

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <UniversalFilterBar value={filter} onChange={setFilter} summaryText={query.data ? `${query.data.count} task${query.data.count !== 1 ? "s" : ""}` : undefined} />

      <div className="flex flex-1 overflow-hidden">
        {/* Main grid */}
        <div className="flex-1 overflow-x-auto overflow-y-auto">
          <table className="w-full border-collapse text-xs" style={{ tableLayout: "fixed" }}>
            <colgroup>
              <col style={{ width: empColWidth }} />
              {dates.map((d) => <col key={d} style={{ width: `${dayColPct}%` }} />)}
            </colgroup>
            <thead className="sticky top-0 z-10 bg-gray-50">
              <tr>
                <th
                  className="relative border border-gray-200 px-2 py-1 text-left text-[10px] font-semibold text-gray-600 select-none"
                  style={{ width: empColWidth }}
                >
                  Employee
                  <div
                    className="absolute right-0 top-0 h-full w-1 cursor-col-resize hover:bg-blue-400"
                    onMouseDown={onResizeMouseDown}
                  />
                </th>
                {dates.map((d) => {
                  const isToday = d === new Date().toISOString().split("T")[0];
                  return (
                    <th
                      key={d}
                      className={`border border-gray-200 px-1 py-1 text-center text-[10px] font-semibold ${isToday ? "bg-green-50 text-green-700" : "text-gray-600"}`}
                    >
                      <div>{fmtDow(d)}</div>
                      <div className="text-[9px] font-normal opacity-70">{fmtMD(d)}</div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {query.isLoading && (
                <tr><td colSpan={dates.length + 1} className="p-4 text-center text-xs text-gray-500">Loading…</td></tr>
              )}
              {!query.isLoading && employees.length === 0 && (
                <tr><td colSpan={dates.length + 1} className="p-4 text-center text-xs text-gray-500">No tasks in this period.</td></tr>
              )}
              {employees.map(([uid, name]) => (
                <tr key={uid} style={{ height: 30 }}>
                  <td className="border border-gray-200 px-2 py-0.5 text-[10px] font-medium text-gray-700 truncate bg-white">
                    {name}
                  </td>
                  {dates.map((d) => {
                    const cellTasks = (query.data?.by_employee[uid] ?? []) as Task[];
                    const dayTasks = cellTasks.filter((t) => t.scheduled_date === d);
                    return (
                      <td key={d} className="border border-gray-200 px-0.5 py-0.5 align-top bg-white">
                        {dayTasks.map((t) => (
                          <TaskBlock key={t.task_id} task={t} onClick={() => setSelectedTask(t)} />
                        ))}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Detail drawer ~170px */}
        {selectedTask && (
          <div className="flex-shrink-0 border-l border-gray-200 bg-white overflow-hidden" style={{ width: 170 }}>
            <TaskDrawer task={selectedTask} onClose={() => setSelectedTask(null)} />
          </div>
        )}
      </div>
    </div>
  );
}

export default TaskPlannerGrid;
