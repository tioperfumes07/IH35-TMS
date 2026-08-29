import { entityLabel } from "../../lib/entity-label";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "../../components/layout/PageHeader";
import { ListErrorBanner } from "../../components/shared/ListErrorBanner";
import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
import { CollapsedListFilters, useStagedListFilters } from "../../components/table";
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

type AssigneeRow = {
  name: string;
  total: number;
  completed: number;
  open: number;
  overdue: number;
  avgActualMinutes: number | null;
};

type ReportFilters = {
  windowDays: number;
  overdueOnly: boolean;
};

function taskAssigneeLabel(task: Task) {
  return entityLabel(task.assigned_to_name || task.assigned_to_email, task.assigned_to_user_id, "User");
}

// TASK-4: Admin Report — team task productivity (was an unbuilt placeholder). Aggregates the
// existing /api/v1/tasks/planner data client-side: throughput by status and per-assignee.
export function TasksReportPage() {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const [filters, setFilters] = useState<ReportFilters>({ windowDays: 30, overdueOnly: false });
  const staged = useStagedListFilters({
    applied: filters,
    empty: { windowDays: 30, overdueOnly: false },
    onApply: (next) => setFilters(next),
  });
  const today = companyToday();
  const date_from = addDaysIso(today, -filters.windowDays);
  const date_to = addDaysIso(today, 1);

  const query = useQuery({
    queryKey: ["tasks", "report", companyId, date_from, date_to],
    queryFn: ({ signal }) => fetchPlannerTasks({ operating_company_id: companyId, date_from, date_to }, signal),
    enabled: Boolean(companyId),
  });

  // GO-0044-TASKS-REPORT-OVERDUE-ROLLOVER-CONTAMINATION: /tasks/planner (fetchPlannerTasks)
  // intentionally includes ANY still-open task scheduled before date_from, unbounded -- that's
  // correct for the Planner grid (so "This Week" never hides old open work), but wrong here: this
  // page presents an explicit "Window: 7d/30d/90d" period contract, and without this filter a task
  // scheduled a year ago that's still open gets counted in "Total tasks"/"Completion rate"/the
  // per-assignee table for EVERY window size, silently deflating completion rate and making the
  // Window filter not actually change the denominator the way it implies. Re-scope to the report's
  // own selected period; the Planner/Calendar/Mine pages that also call this endpoint keep the
  // unbounded rollover, unaffected (they read query.data directly, not through this page).
  const tasks = useMemo(
    () => (query.data?.tasks ?? []).filter((t) => t.scheduled_date >= date_from && t.scheduled_date <= date_to),
    [query.data?.tasks, date_from, date_to],
  );

  const statusCounts = useMemo(() => {
    const m = new Map<TaskStatus, number>();
    for (const t of tasks) m.set(t.status, (m.get(t.status) ?? 0) + 1);
    return m;
  }, [tasks]);

  const completionRate = tasks.length > 0 ? Math.round(((statusCounts.get("completed") ?? 0) / tasks.length) * 100) : 0;

  const byAssignee = useMemo<AssigneeRow[]>(() => {
    const groups = new Map<string, Task[]>();
    for (const t of tasks) {
      const name = taskAssigneeLabel(t);
      const list = groups.get(name) ?? [];
      list.push(t);
      groups.set(name, list);
    }
    const rows = [...groups.entries()]
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
    return filters.overdueOnly ? rows.filter((row) => row.overdue > 0) : rows;
  }, [tasks, today, filters.overdueOnly]);

  // ParityTable columns (A1 grammar): built-in sort/density/column-toggle/pager replace the former
  // hand-rolled table. Preserves the overdue red-highlight on the Overdue column.
  const assigneeColumns = useMemo<ParityColumn<AssigneeRow>[]>(
    () => [
      { key: "name", label: "Assignee", sortable: true, cellClass: "font-medium text-slate-800" },
      { key: "total", label: "Total", sortable: true, cellClass: "text-slate-600" },
      { key: "completed", label: "Completed", sortable: true, cellClass: "text-slate-600" },
      { key: "open", label: "Open", sortable: true, cellClass: "text-slate-600" },
      {
        key: "overdue",
        label: "Overdue",
        sortable: true,
        render: (row) => <span className={row.overdue > 0 ? "font-semibold text-red-700" : "text-slate-600"}>{row.overdue}</span>,
      },
      { key: "avgActualMinutes", label: "Avg time (min)", sortable: true, render: (row) => row.avgActualMinutes ?? "—", cellClass: "text-slate-600" },
    ],
    [],
  );

  const activeFilterCount =
    (filters.windowDays !== 30 ? 1 : 0) + (filters.overdueOnly ? 1 : 0);

  if (!companyId) {
    return (
      <div className="space-y-4 p-4">
        <PageHeader title="Admin Report" subtitle="Task throughput and team productivity" />
        <TasksModuleTabs />
        <div className="rounded-sm border border-dashed border-gray-300 bg-gray-50 p-4 text-sm text-gray-700">
          Select an operating company to view the task report.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <PageHeader title="Admin Report" subtitle="Task throughput and team productivity" />
      <TasksModuleTabs />

      {query.isLoading ? <div className="text-xs text-slate-500">Loading report…</div> : null}
      {query.isError ? <ListErrorBanner onRetry={() => void query.refetch()} /> : null}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {([
          ["Total tasks", tasks.length],
          ["Completed", statusCounts.get("completed") ?? 0],
          ["Completion rate", `${completionRate}%`],
          ["Open", tasks.filter((t) => isOpenTaskStatus(t.status)).length],
        ] as Array<[string, number | string]>).map(([label, value]) => (
          <div key={label} className="rounded-sm border border-slate-200 bg-white p-3">
            <div className="text-xs font-semibold text-slate-500">{label}</div>
            <div className="text-xl font-bold text-slate-900">{value}</div>
          </div>
        ))}
      </div>

      <div className="space-y-2">
        <div className="text-sm font-semibold text-slate-900">By assignee</div>
        <ParityTable
          rows={byAssignee}
          columns={assigneeColumns}
          rowKey={(row) => row.name}
          // Settled-only empty (LIST-EMPTY-1 invariant): show loading while pending OR while a
          // refetch is in flight with zero current rows, so emptyText never flashes mid-fetch.
          loading={query.isPending || (query.isFetching && byAssignee.length === 0)}
          storageKey="tasks-report-by-assignee"
          emptyText="No assignees match the applied filters."
          filterBar={
            <CollapsedListFilters
              activeFilterCount={activeFilterCount}
              onApply={staged.apply}
              onReset={staged.reset}
              onCancel={staged.cancel}
              applyDisabled={!staged.dirty}
              testIdPrefix="tasks-report"
              dataAttributes={{ "data-tasks-report-filter-toolbar": "collapsed" }}
            >
              <div className="flex flex-wrap items-end gap-3">
                <label className="text-xs font-semibold text-slate-600">
                  Window
                  <select
                    className="mt-1 block w-full max-w-xs rounded-sm border border-gray-300 px-2 py-1 text-xs"
                    value={staged.draft.windowDays}
                    onChange={(event) =>
                      staged.setDraft({ ...staged.draft, windowDays: Number(event.target.value) })
                    }
                    data-testid="tasks-report-window-filter"
                  >
                    {WINDOWS.map(([label, days]) => (
                      <option key={label} value={days}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex items-center gap-2 text-xs font-semibold text-slate-600">
                  <input
                    type="checkbox"
                    checked={staged.draft.overdueOnly}
                    onChange={(event) =>
                      staged.setDraft({ ...staged.draft, overdueOnly: event.target.checked })
                    }
                    data-testid="tasks-report-overdue-only"
                  />
                  Assignees with overdue only
                </label>
              </div>
            </CollapsedListFilters>
          }
        />
      </div>
    </div>
  );
}
