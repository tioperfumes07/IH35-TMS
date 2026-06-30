import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "../../components/layout/PageHeader";
import { TasksModuleTabs } from "./TasksModuleTabs";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { getMe } from "../../api/identity";
import { fetchPlannerTasks } from "../../api/tasks";
import { addDaysIso, companyToday } from "../../lib/businessDate";
import { TASK_STATUS_BADGE, isOpenTaskStatus, priorityLabel, taskStatusLabel } from "./taskDisplay";

// TASK-2: My Tasks — the current user's assigned tasks (was an unbuilt placeholder). Reads the
// existing /api/v1/tasks/planner endpoint filtered by assigned_to = current user.
export function TasksMinePage() {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const meQuery = useQuery({ queryKey: ["identity", "me"], queryFn: getMe });
  const myId = meQuery.data?.user.uuid ?? "";

  const today = companyToday();
  const date_from = addDaysIso(today, -30);
  const date_to = addDaysIso(today, 60);

  const query = useQuery({
    queryKey: ["tasks", "mine", companyId, myId, date_from, date_to],
    queryFn: () => fetchPlannerTasks({ operating_company_id: companyId, assigned_to: myId, date_from, date_to }),
    enabled: Boolean(companyId && myId),
  });

  const tasks = [...(query.data?.tasks ?? [])].sort((a, b) => a.scheduled_date.localeCompare(b.scheduled_date));
  const openTasks = tasks.filter((t) => isOpenTaskStatus(t.status));
  const overdue = openTasks.filter((t) => t.scheduled_date < today);

  return (
    <div className="space-y-4">
      <PageHeader title="My Tasks" subtitle="Tasks assigned to you" />
      <TasksModuleTabs />

      <div className="grid grid-cols-3 gap-3">
        {([
          ["Open", openTasks.length],
          ["Overdue", overdue.length],
          ["Completed (window)", tasks.filter((t) => t.status === "completed").length],
        ] as Array<[string, number]>).map(([label, value]) => (
          <div key={label} className="rounded border border-slate-200 bg-white p-3">
            <div className="text-xs font-semibold text-slate-500">{label}</div>
            <div className="text-xl font-bold text-slate-900">{value}</div>
          </div>
        ))}
      </div>

      <div className="rounded border border-slate-200 bg-white">
        {query.isLoading ? (
          <div className="p-4 text-xs text-slate-500">Loading your tasks…</div>
        ) : query.isError ? (
          <div className="p-4 text-xs text-red-700">Couldn't load your tasks.</div>
        ) : tasks.length === 0 ? (
          <div className="p-6 text-center text-xs text-slate-500">No tasks assigned to you in this window.</div>
        ) : (
          <div className="overflow-x-auto">
          <table className="min-w-full text-left text-xs">
            <thead className="border-b border-slate-200 text-slate-500">
              <tr>
                <th className="px-3 py-2 font-semibold">Task</th>
                <th className="px-3 py-2 font-semibold">Category</th>
                <th className="px-3 py-2 font-semibold">Scheduled</th>
                <th className="px-3 py-2 font-semibold">Priority</th>
                <th className="px-3 py-2 font-semibold">Status</th>
                <th className="px-3 py-2 font-semibold">Progress</th>
              </tr>
            </thead>
            <tbody>
              {tasks.map((t) => (
                <tr key={t.task_id} className="border-t border-slate-100">
                  <td className="px-3 py-2 font-medium text-slate-800">{t.title}</td>
                  <td className="px-3 py-2 capitalize text-slate-600">{t.category}</td>
                  <td
                    className={`px-3 py-2 ${isOpenTaskStatus(t.status) && t.scheduled_date < today ? "font-semibold text-red-700" : "text-slate-600"}`}
                  >
                    {t.scheduled_date}
                  </td>
                  <td className="px-3 py-2 text-slate-600">{priorityLabel(t.priority)}</td>
                  <td className="px-3 py-2">
                    <span className={`rounded border px-1.5 py-0.5 text-[10px] ${TASK_STATUS_BADGE[t.status]}`}>
                      {taskStatusLabel(t.status)}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-slate-600">{t.progress_pct}%</td>
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
