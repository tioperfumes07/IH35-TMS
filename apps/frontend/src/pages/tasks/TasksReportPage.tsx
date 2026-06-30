import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "../../components/layout/PageHeader";
import { TasksModuleTabs } from "./TasksModuleTabs";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { fetchPlannerTasks, type Task, type TaskStatus } from "../../api/tasks";
import { addDaysIso, companyToday } from "../../lib/businessDate";
import { isOpenTaskStatus } from "./taskDisplay";

const WINDOWS: Array<[string, number]> = [
  ["7d", 7],
  ["30d", 30],
  ["90d", 90],
];

type EmployeeRow = {
  name: string;
  total: number;
  completed: number;
  open: number;
  overdue: number;
  avgActualMinutes: number | null;
};

// TASK-4: Admin Report — team task productivity (was an unbuilt placeholder). Aggregates the
// existing /api/v1/tasks/planner data client-side: throughput by status and per-assignee.
export function TasksReportPage() {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const [windowDays, setWindowDays] = useState(30);
  const today = companyToday();
  const date_from = addDaysIso(today, -windowDays);
  const date_to = addDaysIso(today, 1);

  const query = useQuery({
    queryKey: ["tasks", "report", companyId, date_from, date_to],
    queryFn: () => fetchPlannerTasks({ operating_company_id: companyId, date_from, date_to }),
    enabled: Boolean(companyId),
  });

  const tasks = query.data?.tasks ?? [];

  const statusCounts = useMemo(() => {
    const m = new Map<TaskStatus, number>();
    for (const t of tasks) m.set(t.status, (m.get(t.status) ?? 0) + 1);
    return m;
  }, [tasks]);

  const completionRate = tasks.length > 0 ? Math.round(((statusCounts.get("completed") ?? 0) / tasks.length) * 100) : 0;

  const byEmployee = useMemo<EmployeeRow[]>(() => {
    const groups = new Map<string, Task[]>();
    for (const t of tasks) {
      const name = t.assigned_to_name ?? t.assigned_to_email ?? t.assigned_to_user_id;
      const list = groups.get(name) ?? [];
      list.push(t);
      groups.set(name, list);
    }
    return [...groups.entries()]
      .map(([name, list]) => {
        const completedWithTime = list.filter((t) => t.status === "completed" && typeof t.actual_minutes === "number");
        const avg =
          completedWithTime.length > 0
            ? Math.round(completedWithTime.reduce((s, t) => s + (t.actual_minutes ?? 0), 0) / completedWithTime.length)
            : null;
        return {
          name,
          total: list.length,
          completed: list.filter((t) => t.status === "completed").length,
          open: list.filter((t) => isOpenTaskStatus(t.status)).length,
          overdue: list.filter((t) => isOpenTaskStatus(t.status) && t.scheduled_date < today).length,
          avgActualMinutes: avg,
        };
      })
      .sort((a, b) => b.total - a.total);
  }, [tasks, today]);

  return (
    <div className="space-y-4">
      <PageHeader title="Admin Report" subtitle="Task throughput and team productivity" />
      <TasksModuleTabs />

      <div className="flex items-center gap-2 rounded border border-slate-200 bg-white px-3 py-2 text-xs">
        <span className="font-semibold text-slate-600">Window</span>
        {WINDOWS.map(([label, days]) => (
          <button
            key={label}
            type="button"
            onClick={() => setWindowDays(days)}
            className={`rounded px-2 py-1 ${windowDays === days ? "bg-slate-800 text-white" : "bg-slate-100 text-slate-700"}`}
          >
            {label}
          </button>
        ))}
      </div>

      {query.isLoading ? <div className="text-xs text-slate-500">Loading report…</div> : null}
      {query.isError ? <div className="text-xs text-red-700">Couldn't load the report.</div> : null}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {([
          ["Total tasks", tasks.length],
          ["Completed", statusCounts.get("completed") ?? 0],
          ["Completion rate", `${completionRate}%`],
          ["Open", tasks.filter((t) => isOpenTaskStatus(t.status)).length],
        ] as Array<[string, number | string]>).map(([label, value]) => (
          <div key={label} className="rounded border border-slate-200 bg-white p-3">
            <div className="text-xs font-semibold text-slate-500">{label}</div>
            <div className="text-xl font-bold text-slate-900">{value}</div>
          </div>
        ))}
      </div>

      <div className="rounded border border-slate-200 bg-white">
        <div className="border-b border-slate-200 px-3 py-2 text-sm font-semibold text-slate-900">By assignee</div>
        {byEmployee.length === 0 ? (
          <div className="p-6 text-center text-xs text-slate-500">No tasks in this window.</div>
        ) : (
          <div className="overflow-x-auto">
          <table className="min-w-full text-left text-xs">
            <thead className="border-b border-slate-200 text-slate-500">
              <tr>
                <th className="px-3 py-2 font-semibold">Assignee</th>
                <th className="px-3 py-2 font-semibold">Total</th>
                <th className="px-3 py-2 font-semibold">Completed</th>
                <th className="px-3 py-2 font-semibold">Open</th>
                <th className="px-3 py-2 font-semibold">Overdue</th>
                <th className="px-3 py-2 font-semibold">Avg time (min)</th>
              </tr>
            </thead>
            <tbody>
              {byEmployee.map((r) => (
                <tr key={r.name} className="border-t border-slate-100">
                  <td className="px-3 py-2 font-medium text-slate-800">{r.name}</td>
                  <td className="px-3 py-2 text-slate-600">{r.total}</td>
                  <td className="px-3 py-2 text-green-700">{r.completed}</td>
                  <td className="px-3 py-2 text-slate-600">{r.open}</td>
                  <td className={`px-3 py-2 ${r.overdue > 0 ? "font-semibold text-red-700" : "text-slate-600"}`}>{r.overdue}</td>
                  <td className="px-3 py-2 text-slate-600">{r.avgActualMinutes ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </div>
    </div>
  );
}
