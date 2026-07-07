import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "../../components/layout/PageHeader";
import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
import { TasksModuleTabs } from "./TasksModuleTabs";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { getMe } from "../../api/identity";
import { fetchPlannerTasks, type Task } from "../../api/tasks";
import { addDaysIso, companyToday } from "../../lib/businessDate";
import { TASK_STATUS_BADGE, isOpenTaskStatus, priorityLabel, taskStatusLabel } from "./taskDisplay";
import { formatDateUS } from "../../lib/formatDate";

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

  // ParityTable columns (A1 grammar): built-in sort/density/column-toggle/pager replace the former
  // hand-rolled table. Preserves the overdue red-highlight on the Scheduled column.
  const columns = useMemo<ParityColumn<Task>[]>(
    () => [
      { key: "title", label: "Task", sortable: true, cellClass: "font-medium text-slate-800" },
      { key: "category", label: "Category", sortable: true, cellClass: "capitalize text-slate-600" },
      {
        key: "scheduled_date",
        label: "Scheduled",
        sortable: true,
        render: (row) => (
          <span className={isOpenTaskStatus(row.status) && row.scheduled_date < today ? "font-semibold text-red-700" : "text-slate-600"}>
            {formatDateUS(row.scheduled_date)}
          </span>
        ),
      },
      { key: "priority", label: "Priority", sortable: true, render: (row) => priorityLabel(row.priority), cellClass: "text-slate-600" },
      {
        key: "status",
        label: "Status",
        sortable: true,
        render: (row) => (
          <span className={`rounded-sm border px-1.5 py-0.5 text-[10px] ${TASK_STATUS_BADGE[row.status]}`}>{taskStatusLabel(row.status)}</span>
        ),
      },
      { key: "progress_pct", label: "Progress", sortable: true, render: (row) => `${row.progress_pct}%`, cellClass: "text-slate-600" },
    ],
    [today],
  );

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
          <div key={label} className="rounded-sm border border-slate-200 bg-white p-3">
            <div className="text-xs font-semibold text-slate-500">{label}</div>
            <div className="text-xl font-bold text-slate-900">{value}</div>
          </div>
        ))}
      </div>

      {query.isError ? (
        <div className="rounded-sm border border-slate-200 bg-white p-4 text-xs text-red-700">Couldn't load your tasks.</div>
      ) : (
        <ParityTable
          rows={tasks}
          columns={columns}
          rowKey={(row) => row.task_id}
          // Settled-only empty (LIST-EMPTY-1 invariant): show loading while pending OR while a
          // refetch is in flight with zero current rows, so emptyText never flashes mid-fetch.
          loading={query.isPending || (query.isFetching && tasks.length === 0)}
          storageKey="tasks-mine"
          emptyText="No tasks assigned to you in this window."
        />
      )}
    </div>
  );
}
