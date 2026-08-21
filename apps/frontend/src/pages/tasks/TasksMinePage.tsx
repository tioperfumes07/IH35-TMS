import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "../../components/layout/PageHeader";
import { ListErrorBanner } from "../../components/shared/ListErrorBanner";
import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
import { CollapsedListFilters, useStagedListFilters } from "../../components/table";
import { SelectCombobox } from "../../components/shared/SelectCombobox";
import { TasksModuleTabs } from "./TasksModuleTabs";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { getMe } from "../../api/identity";
import { fetchPlannerTasks, type Task } from "../../api/tasks";
import { addDaysIso, companyToday } from "../../lib/businessDate";
import { TASK_STATUS_BADGE, isOpenTaskStatus, priorityLabel, taskStatusLabel } from "./taskDisplay";
import { formatDateUS } from "../../lib/formatDate";
import { TaskSubjectLink } from "../../components/tasks/TaskSubjectLink";

type StatusFilter = "all" | "open" | "completed";

// TASK-2: My Tasks — the current user's assigned tasks (was an unbuilt placeholder). Reads the
// existing /api/v1/tasks/planner endpoint filtered by assigned_to = current user.
// CODEX-ZERO-REMAINDER-PROTECTED-CHROME-7 — staged Filters Apply triad (chrome.toolbar_filter).
export function TasksMinePage() {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const meQuery = useQuery({ queryKey: ["identity", "me"], queryFn: ({ signal }) => getMe(signal) });
  const myId = meQuery.data?.user.uuid ?? "";
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const staged = useStagedListFilters({
    applied: { statusFilter },
    empty: { statusFilter: "all" as StatusFilter },
    onApply: (next) => setStatusFilter(next.statusFilter),
  });

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
  const visibleTasks = useMemo(() => {
    if (statusFilter === "open") return tasks.filter((t) => isOpenTaskStatus(t.status));
    if (statusFilter === "completed") return tasks.filter((t) => t.status === "completed");
    return tasks;
  }, [tasks, statusFilter]);

  // ParityTable columns (A1 grammar): built-in sort/density/column-toggle/pager replace the former
  // hand-rolled table. Preserves the overdue red-highlight on the Scheduled column.
  const columns = useMemo<ParityColumn<Task>[]>(
    () => [
      { key: "title", label: "Task", sortable: true, cellClass: "font-medium text-slate-800" },
      {
        key: "subject_id",
        label: "About",
        render: (row) => <TaskSubjectLink subjectType={row.subject_type} subjectId={row.subject_id} subjectLabel={row.subject_label} />,
      },
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

  if (!companyId) {
    return (
      <div className="space-y-4 p-4">
        <PageHeader title="My Tasks" subtitle="Tasks assigned to you" />
        <TasksModuleTabs />
        <div className="rounded-sm border border-dashed border-gray-300 bg-gray-50 p-4 text-sm text-gray-700">
          Select an operating company to view your tasks.
        </div>
      </div>
    );
  }

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

      <CollapsedListFilters
        activeFilterCount={statusFilter !== "all" ? 1 : 0}
        onApply={staged.apply}
        onReset={staged.reset}
        onCancel={staged.cancel}
        applyDisabled={!staged.dirty}
        testIdPrefix="tasks-mine"
        dataAttributes={{ "data-tasks-mine-filter-toolbar": "collapsed" }}
      >
        <label className="flex flex-col gap-1 text-xs font-semibold text-gray-600">
          Status
          <SelectCombobox
            value={staged.draft.statusFilter}
            onChange={(event) => staged.setDraft({ statusFilter: event.target.value as StatusFilter })}
            className="h-9 rounded-sm border border-gray-300 px-2 text-[13px]"
          >
            <option value="all">All</option>
            <option value="open">Open</option>
            <option value="completed">Completed</option>
          </SelectCombobox>
        </label>
      </CollapsedListFilters>

      {query.isError ? (
        <ListErrorBanner onRetry={() => void query.refetch()} />
      ) : (
        <ParityTable
          rows={visibleTasks}
          columns={columns}
          rowKey={(row) => row.task_id}
          // Settled-only empty (LIST-EMPTY-1 invariant): show loading while pending OR while a
          // refetch is in flight with zero current rows, so emptyText never flashes mid-fetch.
          loading={query.isPending || (query.isFetching && visibleTasks.length === 0)}
          storageKey="tasks-mine"
          emptyText="No tasks assigned to you in this window."
        />
      )}
    </div>
  );
}
