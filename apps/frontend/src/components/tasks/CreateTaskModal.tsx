import { useMemo, useState } from "react";
import { DatePicker } from "../forms/DatePicker";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Modal } from "../Modal";
import { useToast } from "../Toast";
import { createTask, type TaskCategory } from "../../api/tasks";
import { listUsers } from "../../api/identity";
import type { IdentityUser } from "../../types/api";
import { companyToday } from "../../lib/businessDate";

type Props = {
  open: boolean;
  operatingCompanyId: string;
  /** Pre-fill the scheduled date (YYYY-MM-DD); defaults to today. */
  defaultDate?: string;
  onClose: () => void;
  onCreated?: () => void;
};

const CATEGORIES: { value: TaskCategory; label: string }[] = [
  { value: "dispatch", label: "Dispatch" },
  { value: "load", label: "Load" },
  { value: "maintenance", label: "Maintenance" },
  { value: "safety", label: "Safety" },
  { value: "admin", label: "Admin" },
];

const PRIORITIES = [
  { value: 0, label: "Normal" },
  { value: 1, label: "High" },
  { value: 2, label: "Urgent" },
];

function userLabel(u: IdentityUser): string {
  const full = [u.first_name, u.last_name].filter(Boolean).join(" ").trim();
  return u.name || full || u.email || u.id;
}

// Company-local "today" (Central), not UTC — avoids defaulting the scheduled date to tomorrow
// when booked in the evening. See lib/businessDate.
function todayISO(): string {
  return companyToday();
}

export function CreateTaskModal({ open, operatingCompanyId, defaultDate, onClose, onCreated }: Props) {
  const { pushToast } = useToast();
  const queryClient = useQueryClient();

  const [title, setTitle] = useState("");
  const [assignedTo, setAssignedTo] = useState("");
  const [scheduledDate, setScheduledDate] = useState(defaultDate ?? todayISO());
  const [category, setCategory] = useState<TaskCategory>("dispatch");
  const [priority, setPriority] = useState(0);
  const [description, setDescription] = useState("");

  const usersQuery = useQuery({
    queryKey: ["identity", "users", "assignable"],
    queryFn: () => listUsers(false),
    enabled: open,
  });
  const users = useMemo(
    () => (usersQuery.data?.users ?? []).filter((u) => !u.deactivated_at).sort((a, b) => userLabel(a).localeCompare(userLabel(b))),
    [usersQuery.data]
  );

  const reset = () => {
    setTitle("");
    setAssignedTo("");
    setScheduledDate(defaultDate ?? todayISO());
    setCategory("dispatch");
    setPriority(0);
    setDescription("");
  };

  const mutation = useMutation({
    mutationFn: () =>
      createTask({
        operating_company_id: operatingCompanyId,
        category,
        title: title.trim(),
        assigned_to_user_id: assignedTo,
        scheduled_date: scheduledDate,
        priority,
        ...(description.trim() ? { description: description.trim(), notes: description.trim() } : {}),
      }),
    onSuccess: () => {
      pushToast("Task created", "success");
      void queryClient.invalidateQueries({ queryKey: ["planner"] });
      reset();
      onCreated?.();
      onClose();
    },
    onError: (err) => pushToast(String((err as Error).message || "Could not create task"), "error"),
  });

  const canSubmit =
    Boolean(operatingCompanyId) && title.trim().length > 0 && assignedTo.length > 0 && scheduledDate.length > 0 && !mutation.isPending;

  const labelCls = "block text-[11px] font-semibold uppercase tracking-wide text-gray-600";
  const inputCls = "mt-1 w-full rounded border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-800 focus:border-slate-300 focus:outline-none";

  return (
    <Modal open={open} onClose={onClose} title="Create task" modalKind="create-task" sizePreset="md">
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (canSubmit) mutation.mutate();
        }}
      >
        <div>
          <label className={labelCls} htmlFor="create-task-title">Title</label>
          <input
            id="create-task-title"
            className={inputCls}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="What needs to be done?"
            maxLength={200}
            autoFocus
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls} htmlFor="create-task-assignee">Assignee</label>
            <select id="create-task-assignee" className={inputCls} value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)}>
              <option value="">{usersQuery.isLoading ? "Loading…" : "Select an employee"}</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>{userLabel(u)}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelCls} htmlFor="create-task-date">Scheduled date</label>
            <DatePicker id="create-task-date" className={inputCls} value={scheduledDate} onChange={setScheduledDate} />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls} htmlFor="create-task-category">Category</label>
            <select id="create-task-category" className={inputCls} value={category} onChange={(e) => setCategory(e.target.value as TaskCategory)}>
              {CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelCls} htmlFor="create-task-priority">Priority</label>
            <select id="create-task-priority" className={inputCls} value={priority} onChange={(e) => setPriority(Number(e.target.value))}>
              {PRIORITIES.map((p) => (
                <option key={p.value} value={p.value}>{p.label}</option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className={labelCls} htmlFor="create-task-desc">Description</label>
          <textarea
            id="create-task-desc"
            className={`${inputCls} h-20 resize-y`}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Optional detail / notes"
            maxLength={2000}
          />
        </div>

        <p className="text-[11px] text-gray-500">New tasks start with status <span className="font-semibold">Pending</span>; change it on the board after creating.</p>

        <div className="flex items-center justify-end gap-2 pt-1">
          <button type="button" className="rounded border border-gray-300 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50" onClick={onClose}>
            Cancel
          </button>
          <button
            type="submit"
            disabled={!canSubmit}
            className="rounded bg-[#16A34A] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#15803d] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {mutation.isPending ? "Creating…" : "Create task"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
