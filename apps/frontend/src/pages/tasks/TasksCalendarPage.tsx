import { PageHeader } from "../../components/layout/PageHeader";
import { TasksModuleTabs } from "./TasksModuleTabs";

export function TasksCalendarPage() {
  return (
    <div className="space-y-4">
      <PageHeader title="Calendar" />
      <TasksModuleTabs />
      <div className="rounded border border-gray-200 bg-white p-8">
        <div className="text-center">
          <h3 className="text-lg font-semibold text-gray-900">Calendar View</h3>
          <p className="mt-2 text-sm text-gray-500">
            Team calendar view for task scheduling and planning.
          </p>
        </div>
      </div>
    </div>
  );
}
