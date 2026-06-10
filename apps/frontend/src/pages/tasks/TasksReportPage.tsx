import { PageHeader } from "../../components/layout/PageHeader";
import { TasksModuleTabs } from "./TasksModuleTabs";

export function TasksReportPage() {
  return (
    <div className="space-y-4">
      <PageHeader title="Admin Report" />
      <TasksModuleTabs />
      <div className="rounded border border-gray-200 bg-white p-8">
        <div className="text-center">
          <h3 className="text-lg font-semibold text-gray-900">Admin Reporting</h3>
          <p className="mt-2 text-sm text-gray-500">
            Admin reporting on time-to-do tasks and team productivity.
          </p>
        </div>
      </div>
    </div>
  );
}
