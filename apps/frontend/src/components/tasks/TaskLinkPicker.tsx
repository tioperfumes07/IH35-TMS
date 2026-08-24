import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Modal } from "../Modal";
import { useToast } from "../Toast";
import { createTaskLink, fetchTasks, type Task, type TaskTargetType } from "../../api/tasks";
import { formatDateUS } from "../../lib/formatDate";
import { userFacingApiError } from "../../lib/api-error-message";
import { CappedListNotice } from "../CappedListNotice";
import { ParityTable } from "../parity/ParityTable";

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
    mutationFn: (task: Task) =>
      createTaskLink(task.task_id, operatingCompanyId, { role: "result", target_type: targetType, target_id: targetId }),
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
          ) : (
            /* TASK-F3582: embedded ParityTable owns Search+Range+gear inside the link-task modal. */
            <ParityTable<Task>
              embedded
              rows={openTasks}
              rowKey={(t) => t.task_id}
              storageKey="task-link-picker-open"
              exportFilename="task-link-picker-open"
              tableTestId="task-link-picker-table"
              emptyText="No open tasks."
              columns={[
                {
                  key: "title",
                  label: "Task",
                  cellClass: "text-gray-800",
                  render: (t) => (
                    <>
                      {t.title}
                      {t.anticipated_category ? (
                        <span className="ml-1 text-[11px] text-slate-500">({t.anticipated_category})</span>
                      ) : null}
                    </>
                  ),
                },
                {
                  key: "due",
                  label: "Due",
                  cellClass: "text-gray-600",
                  render: (t) => formatDateUS(t.scheduled_date) || "—",
                },
                {
                  key: "assignee",
                  label: "Assignee",
                  cellClass: "text-gray-600",
                  render: (t) => t.assigned_to_name ?? "—",
                },
                {
                  key: "link",
                  label: " ",
                  render: (t) => (
                    <button
                      type="button"
                      disabled={linkMutation.isPending}
                      className="rounded-sm border border-slate-300 bg-slate-100 px-2 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-200 disabled:opacity-50"
                      onClick={() => linkMutation.mutate(t)}
                    >
                      Link & complete
                    </button>
                  ),
                },
              ]}
            />
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
