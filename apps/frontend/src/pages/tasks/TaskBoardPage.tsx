import { PageHeader } from "../../components/layout/PageHeader";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { TasksModuleTabs } from "./TasksModuleTabs";
import { TaskPlannerGrid } from "./TaskPlannerGrid";

export function TaskBoardPage() {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";

  if (!companyId) {
    return (
      <div className="flex h-full flex-col overflow-hidden p-4">
        <PageHeader title="Task Board" />
        <div className="rounded-sm border border-dashed border-gray-300 bg-gray-50 p-4 text-sm text-gray-700">
          Select an operating company to view the task board.
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="shrink-0 space-y-0">
        {/* CLS-CHROME-LAW-8 (item 8, "no box-in-box"): this page's own "+ Create Task" PageHeader
            action + local CreateTaskModal instance were removed — TasksModuleTabs (mounted right
            below) already renders the single canonical "+ Create Task" affordance shared across
            every Tasks tab (TASKS-6), so Task Board previously showed TWO independent create-task
            buttons/modals stacked on top of each other. */}
        <PageHeader title="Task Board" />
        <TasksModuleTabs />
      </div>
      <div className="flex-1 overflow-hidden">
        <TaskPlannerGrid />
      </div>
    </div>
  );
}
