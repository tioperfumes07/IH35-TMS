import { PageHeader } from "../../components/layout/PageHeader";
import { TasksModuleTabs } from "./TasksModuleTabs";

export function TaskBoardPage() {
  return (
    <div className="space-y-4">
      <PageHeader title="Task Board" />
      <TasksModuleTabs />
      <div className="rounded border border-gray-200 bg-white p-8">
        <div className="text-center">
          <h3 className="text-lg font-semibold text-gray-900">Task System</h3>
          <p className="mt-2 text-sm text-gray-500">
            Team coordination hub with integrated chat, calendar scheduling, and assignment tracking.
          </p>
        </div>
      </div>
    </div>
  );
}
