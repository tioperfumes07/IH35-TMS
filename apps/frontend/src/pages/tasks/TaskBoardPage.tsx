import { PageHeader } from "../../components/layout/PageHeader";
import { BoardSection } from "../../components/v3/BoardSection";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { TasksModuleTabs } from "./TasksModuleTabs";
import { TaskPlannerGrid } from "./TaskPlannerGrid";

export function TaskBoardPage() {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";

  if (!companyId) {
    return (
      <div className="flex h-full flex-col overflow-hidden p-4">
        <PageHeader backHref="/tasks" title="Task Board" />
        <BoardSection title="Task board" testId="task-board-need-company">
          <p className="px-3 py-2 text-xs text-[#4B5563]">Select an operating company to view the task board.</p>
        </BoardSection>
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
        <PageHeader backHref="/tasks" title="Task Board" />
        <TasksModuleTabs />
      </div>
      <div className="flex-1 overflow-hidden">
        <TaskPlannerGrid />
      </div>
    </div>
  );
}
