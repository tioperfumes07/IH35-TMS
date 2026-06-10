import { PageHeader } from "../../components/layout/PageHeader";
import { TasksModuleTabs } from "./TasksModuleTabs";

export function TasksChatPage() {
  return (
    <div className="space-y-4">
      <PageHeader title="Team Chat" />
      <TasksModuleTabs />
      <div className="rounded border border-gray-200 bg-white p-8">
        <div className="text-center">
          <h3 className="text-lg font-semibold text-gray-900">Team Chat</h3>
          <p className="mt-2 text-sm text-gray-500">
            Team communication and messaging around tasks.
          </p>
        </div>
      </div>
    </div>
  );
}
