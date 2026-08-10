import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Modal } from "../Modal";
import { useToast } from "../Toast";
import { createTaskLink, fetchTasks, type Task, type TaskTargetType } from "../../api/tasks";
import { formatDateUS } from "../../lib/formatDate";
import { userFacingApiError } from "../../lib/api-error-message";
import { CappedListNotice } from "../CappedListNotice";

type Props = {
  operatingCompanyId: string;
  /** The record just created (expense/bill/bill_payment/…) that fulfils a task. */
  targetType: TaskTargetType;
  targetId: string;
  /** Button label. Vocab lock: keep it "Tasks". */
  label?: string;
  onLinked?: () => void;
};

const OPEN_STATUSES = new Set(["pending", "in_progress", "blocked", "review"]);

/**
 * Transaction-side completion (TASKS-PLANNER-V2-CONNECTIVITY, the David example).
 * A "Tasks" button in a CREATE flow: opens the OPEN tasks, and picking one links this new record
 * (role='result') to the task AND closes it. Pure pointer — no accounting/GL write.
 */
export function TaskLinkPicker({ operatingCompanyId, targetType, targetId, label = "Tasks", onLinked }: Props) {
  const { pushToast } = useToast();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);

  const tasksQuery = useQuery({
    queryKey: ["tasks-open", operatingCompanyId],
    queryFn: () => fetchTasks({ operating_company_id: operatingCompanyId, limit: 200 }),
    enabled: open && Boolean(operatingCompanyId),
  });

  const openTasks = useMemo(
    () => (tasksQuery.data?.tasks ?? []).filter((t) => OPEN_STATUSES.has(t.status)),
    [tasksQuery.data]
  );

  const linkMutation = useMutation({
    mutationFn: (task: Task) => createTaskLink(task.task_id, { role: "result", target_type: targetType, target_id: targetId }),
    onSuccess: () => {
      pushToast("Task linked and completed", "success");
      void queryClient.invalidateQueries({ queryKey: ["tasks-by-target"] });
      void queryClient.invalidateQueries({ queryKey: ["tasks-open", operatingCompanyId] });
      void queryClient.invalidateQueries({ queryKey: ["planner"] });
      onLinked?.();
      setOpen(false);
    },
    onError: (err) => pushToast(userFacingApiError(err, "Could not link task"), "error"),
  });

  return (
    <>
      <button
        type="button"
        className="rounded-sm border border-slate-300 bg-slate-100 px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-200 disabled:opacity-50"
        onClick={() => setOpen(true)}
        disabled={!operatingCompanyId || !targetId}
      >
        {label}
      </button>

      <Modal open={open} onClose={() => setOpen(false)} title="Link this record to a task" modalKind="link-task" sizePreset="md">
        <div className="space-y-3">
          <p className="text-xs text-gray-600">
            Pick the open task this record fulfils. Linking it marks the task <span className="font-semibold">completed</span>.
          </p>
          {tasksQuery.isLoading ? (
            <p className="text-xs text-gray-500">Loading open tasks…</p>
          ) : openTasks.length === 0 ? (
            <p className="text-xs text-gray-500">No open tasks.</p>
          ) : (
            <div className="overflow-x-auto">
            <table className="min-w-full text-left text-xs">
              <thead>
                <tr className="border-b border-gray-200 text-[11px] uppercase tracking-wide text-gray-500">
                  <th className="py-1.5 pr-3 font-semibold">Task</th>
                  <th className="py-1.5 pr-3 font-semibold">Due</th>
                  <th className="py-1.5 pr-3 font-semibold">Assignee</th>
                  <th className="py-1.5 pr-3" />
                </tr>
              </thead>
              <tbody>
                {openTasks.map((t) => (
                  <tr key={t.task_id} className="border-b border-gray-100">
                    <td className="py-1.5 pr-3 text-gray-800">
                      {t.title}
                      {t.anticipated_category ? <span className="ml-1 text-[11px] text-slate-500">({t.anticipated_category})</span> : null}
                    </td>
                    <td className="py-1.5 pr-3 text-gray-600">{formatDateUS(t.scheduled_date) || "—"}</td>
                    <td className="py-1.5 pr-3 text-gray-600">{t.assigned_to_name ?? "—"}</td>
                    <td className="py-1.5 pr-3">
                      <button
                        type="button"
                        disabled={linkMutation.isPending}
                        className="rounded-sm border border-slate-300 bg-slate-100 px-2 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-200 disabled:opacity-50"
                        onClick={() => linkMutation.mutate(t)}
                      >
                        Link &amp; complete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          )}
          <CappedListNotice
            shown={(tasksQuery.data?.tasks ?? []).length}
            limit={200}
            total={tasksQuery.data?.total_count}
            hint="Only the first page of tasks is listed — narrow with filters on the Tasks module if needed."
            className="text-xs text-slate-600"
          />
        </div>
      </Modal>
    </>
  );
}
