import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchTasksByTarget, type TaskStatus, type TaskTargetType } from "../../api/tasks";
import { CreateTaskModal } from "./CreateTaskModal";
import { formatDateUS } from "../../lib/formatDate";

type Props = {
  operatingCompanyId: string;
  targetType: TaskTargetType;
  targetId: string;
  targetLabel?: string;
};

const STATUS_LABEL: Record<TaskStatus, string> = {
  pending: "Pending",
  in_progress: "In progress",
  blocked: "Blocked",
  review: "Review",
  completed: "Completed",
  cancelled: "Cancelled",
};

// §7 palette — status pills stay on navy/slate (no traffic-light colors).
function StatusPill({ status }: { status: TaskStatus }) {
  const done = status === "completed";
  const cls = done ? "bg-slate-200 text-slate-600" : "bg-slate-100 text-slate-700";
  return <span className={`inline-block rounded-sm px-2 py-0.5 text-[11px] font-semibold ${cls}`}>{STATUS_LABEL[status]}</span>;
}

/**
 * Per-entity task history (TASKS-PLANNER-V2-CONNECTIVITY). Renders every task linked to this record
 * via tasks.task_link, plus a "+ Create" that opens a task pre-linked to the entity.
 */
export function TasksTab({ operatingCompanyId, targetType, targetId, targetLabel }: Props) {
  const [showCreate, setShowCreate] = useState(false);

  const tasksQuery = useQuery({
    queryKey: ["tasks-by-target", operatingCompanyId, targetType, targetId],
    queryFn: () => fetchTasksByTarget({ operating_company_id: operatingCompanyId, target_type: targetType, target_id: targetId }),
    enabled: Boolean(operatingCompanyId && targetId),
  });

  const tasks = tasksQuery.data?.tasks ?? [];

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-700">Tasks</h3>
        <button
          type="button"
          className="rounded-sm border border-slate-300 bg-slate-100 px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-200"
          onClick={() => setShowCreate(true)}
          disabled={!operatingCompanyId}
        >
          + Create
        </button>
      </div>

      {tasksQuery.isLoading ? (
        <p className="text-xs text-gray-500">Loading tasks…</p>
      ) : tasksQuery.isError ? (
        <div className="rounded-sm border border-red-200 bg-red-50 p-2 text-xs text-red-700">
          Could not load linked tasks. <button type="button" className="font-semibold underline" onClick={() => void tasksQuery.refetch()}>Retry</button>
        </div>
      ) : tasks.length === 0 ? (
        <p className="text-xs text-gray-500">No tasks linked to this record yet.</p>
      ) : (
        <div className="overflow-x-auto">
        <table className="min-w-full text-left text-xs">
          <thead>
            <tr className="border-b border-gray-200 text-[11px] uppercase tracking-wide text-gray-500">
              <th className="py-1.5 pr-3 font-semibold">Task</th>
              <th className="py-1.5 pr-3 font-semibold">Status</th>
              <th className="py-1.5 pr-3 font-semibold">Due</th>
              <th className="py-1.5 pr-3 font-semibold">Alarm</th>
              <th className="py-1.5 pr-3 font-semibold">Assignee</th>
            </tr>
          </thead>
          <tbody>
            {tasks.map((t) => (
              <tr key={t.task_id} className="border-b border-gray-100">
                <td className="py-1.5 pr-3 text-gray-800">
                  {t.title}
                  {t.anticipated_category ? <span className="ml-1 text-[11px] text-slate-500">({t.anticipated_category})</span> : null}
                </td>
                <td className="py-1.5 pr-3"><StatusPill status={t.status} /></td>
                <td className="py-1.5 pr-3 text-gray-600">{formatDateUS(t.scheduled_date) || "—"}</td>
                <td className="py-1.5 pr-3 text-gray-600">{t.alarm_at ? new Date(t.alarm_at).toLocaleString() : "—"}</td>
                <td className="py-1.5 pr-3 text-gray-600">{t.assigned_to_name ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      )}

      <CreateTaskModal
        open={showCreate}
        operatingCompanyId={operatingCompanyId}
        presetLink={{ target_type: targetType, target_id: targetId, label: targetLabel }}
        onClose={() => setShowCreate(false)}
        onCreated={() => void tasksQuery.refetch()}
      />
    </div>
  );
}
