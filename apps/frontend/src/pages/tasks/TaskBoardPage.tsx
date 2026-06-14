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

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex-shrink-0 space-y-0">
        <PageHeader
          title="Task Board"
          actions={
            <button
              type="button"
              disabled={!companyId}
              onClick={() => setCreateOpen(true)}
              className="rounded bg-[#16A34A] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#15803d] disabled:cursor-not-allowed disabled:opacity-50"
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
