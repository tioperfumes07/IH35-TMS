import { PageHeader } from "../../components/layout/PageHeader";
import { TasksModuleTabs } from "./TasksModuleTabs";
import { TaskPlannerGrid } from "./TaskPlannerGrid";

export function TaskBoardPage() {
  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex-shrink-0 space-y-0">
        <PageHeader title="Task Board" />
        <TasksModuleTabs />
      </div>
      <div className="flex-1 overflow-hidden">
        <TaskPlannerGrid />
      </div>
    </div>
  );
}
