import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { CreateTaskModal } from "../../components/tasks/CreateTaskModal";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { RelatedModuleLinks } from "../../components/shared/RelatedModuleLinks";
import { useToast } from "../../components/Toast";

const tabs = [
  { id: "board", label: "Task Board", to: "/tasks" },
  { id: "calendar", label: "Calendar", to: "/tasks/calendar" },
  { id: "mine", label: "My Tasks", to: "/tasks/mine" },
  { id: "chat", label: "Team Chat", to: "/tasks/chat" },
  { id: "report", label: "Admin Report", to: "/tasks/report" },
];

export function TasksModuleTabs() {
  const location = useLocation();
  const navigate = useNavigate();
  const currentPath = location.pathname;
  const { selectedCompanyId } = useCompanyContext();
  const { pushToast } = useToast();
  const companyId = selectedCompanyId ?? "";
  const [createOpen, setCreateOpen] = useState(false);

  return (
    <div className="border-b border-gray-200">
      {/* TASKS-6: a persistent "+ Create" on the SHARED Tasks tab bar so every tab (Board / Calendar /
          My Tasks / Team Chat / Admin Report) can create a task — previously only the Board had the
          affordance. Reuses the existing CreateTaskModal (which defaults scheduled_date to companyToday()). */}
      <div className="flex items-center justify-between">
        <nav className="-mb-px flex space-x-6" aria-label="Tasks">
          {tabs.map((tab) => {
            const isActive = currentPath === tab.to;
            return (
              <button
                key={tab.id}
                onClick={() => navigate(tab.to)}
                className={[
                  "whitespace-nowrap border-b-2 px-1 py-3 text-sm font-medium",
                  isActive
                    ? "border-slate-800 text-slate-900"
                    : "border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700",
                ].join(" ")}
              >
                {tab.label}
              </button>
            );
          })}
        </nav>
        <button
          type="button"
          onClick={() => {
            if (!companyId) {
              pushToast("Select an operating company before creating a task", "error");
              return;
            }
            setCreateOpen(true);
          }}
          className="mb-1 rounded-sm border border-gray-300 bg-white px-3 py-1 text-sm font-medium text-gray-800 hover:bg-gray-50"
        >
          + Create Task
        </button>
      </div>
      <RelatedModuleLinks
        className="mb-2 border-0 px-0 py-1"
        testId="tasks-related-module-links"
        links={[
          { label: "Daily Tasks", to: "/daily-tasks" },
          { label: "Service Task Catalog", to: "/lists/maintenance/service-tasks" },
        ]}
      />
      <CreateTaskModal open={createOpen} operatingCompanyId={companyId} onClose={() => setCreateOpen(false)} />
    </div>
  );
}
