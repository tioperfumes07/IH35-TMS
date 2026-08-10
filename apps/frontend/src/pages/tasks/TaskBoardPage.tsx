import { useState } from "react";
import { PageHeader } from "../../components/layout/PageHeader";
import { CreateTaskModal } from "../../components/tasks/CreateTaskModal";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { TasksModuleTabs } from "./TasksModuleTabs";
import { TaskPlannerGrid } from "./TaskPlannerGrid";

export function TaskBoardPage() {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const [createOpen, setCreateOpen] = useState(false);

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
        <PageHeader
          title="Task Board"
          actions={
            <button
              type="button"
              disabled={!companyId}
              onClick={() => setCreateOpen(true)}
              className="rounded-sm bg-[#1f2a44] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#0f1729] disabled:cursor-not-allowed disabled:opacity-50"
            >
              + Create Task
            </button>
          }
        />
        <TasksModuleTabs />
      </div>
      <div className="flex-1 overflow-hidden">
        <TaskPlannerGrid />
      </div>
      <CreateTaskModal
        open={createOpen}
        operatingCompanyId={companyId}
        onClose={() => setCreateOpen(false)}
      />
    </div>
  );
}
