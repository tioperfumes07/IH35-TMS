import { useMemo, useState } from "react";
import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, Clock3, ListChecks, UserRound } from "lucide-react";
import {
  acceptDailyTask,
  completeDailyTask,
  createDailyTask,
  getDailyTaskEvents,
  listDailyTasks,
  type CreateDailyTaskPayload,
  type DailyTask,
  type DailyTaskEvent,
} from "../../api/dailyTasks";
import { listUsers } from "../../api/identity";
import { useAuth } from "../../auth/useAuth";
import { Button } from "../../components/Button";
import { Modal } from "../../components/Modal";
import { useToast } from "../../components/Toast";
import { PageHeader } from "../../components/layout/PageHeader";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { SelectCombobox } from "../../components/shared/SelectCombobox";

type TaskViewId = "my" | "team" | "created";

const VIEW_ORDER: TaskViewId[] = ["my", "team", "created"];
const VIEW_LABEL: Record<TaskViewId, string> = {
  my: "My Tasks",
  team: "Team Tasks",
  created: "Created by Me",
};

const PRIORITY_OPTIONS: Array<{ value: CreateDailyTaskPayload["priority"]; label: string }> = [
  { value: "low", label: "Low" },
  { value: "normal", label: "Normal" },
  { value: "high", label: "High" },
  { value: "urgent", label: "Urgent" },
];

const STATUS_STEPS: Record<DailyTask["status"], string> = {
  created: "Created (1/3)",
  accepted: "Accepted (2/3)",
  completed: "Completed (3/3)",
  cancelled: "Cancelled",
};

function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(d);
}

function toDateTimeLocalValue(value: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  const y = value.getFullYear();
  const m = pad(value.getMonth() + 1);
  const d = pad(value.getDate());
  const hh = pad(value.getHours());
  const mm = pad(value.getMinutes());
  return `${y}-${m}-${d}T${hh}:${mm}`;
}

function statusBadge(status: DailyTask["status"]) {
  if (status === "completed") return "bg-emerald-100 text-emerald-800";
  if (status === "accepted") return "bg-blue-100 text-blue-800";
  if (status === "cancelled") return "bg-zinc-200 text-zinc-700";
  return "bg-amber-100 text-amber-800";
}

function priorityBadge(priority: DailyTask["priority"]) {
  if (priority === "urgent") return "bg-red-100 text-red-800";
  if (priority === "high") return "bg-orange-100 text-orange-800";
  if (priority === "low") return "bg-slate-100 text-slate-700";
  return "bg-indigo-100 text-indigo-800";
}

export function DailyTasksPage() {
  const auth = useAuth();
  const userId = auth.user?.uuid ?? "";
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const queryClient = useQueryClient();
  const { pushToast } = useToast();

  const [view, setView] = useState<TaskViewId>("my");
  const [createOpen, setCreateOpen] = useState(false);
  const [detailTaskId, setDetailTaskId] = useState<string | null>(null);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [assignedToUserId, setAssignedToUserId] = useState("");
  const [priority, setPriority] = useState<DailyTask["priority"]>("normal");
  const [dueLocal, setDueLocal] = useState("");

  const usersQuery = useQuery({
    queryKey: ["daily-tasks", "users"],
    queryFn: () => listUsers(true),
    enabled: Boolean(auth.user),
    staleTime: 60_000,
  });

  const activeUsers = useMemo(() => (usersQuery.data?.users ?? []).filter((user) => !user.deactivated_at), [usersQuery.data?.users]);

  const viewQueries = useQueries({
    queries: VIEW_ORDER.map((id) => {
      const filters =
        id === "my"
          ? { operating_company_id: companyId, assignee: userId }
          : id === "created"
            ? { operating_company_id: companyId, created_by: userId }
            : { operating_company_id: companyId };
      return {
        queryKey: ["daily-tasks", id, companyId, userId],
        queryFn: () => listDailyTasks(filters),
        enabled: Boolean(companyId && userId),
      };
    }),
  });

  const activeRows = viewQueries[VIEW_ORDER.indexOf(view)]?.data?.tasks ?? [];
  const tabCounts = {
    my: viewQueries[0]?.data?.tasks?.length ?? 0,
    team: viewQueries[1]?.data?.tasks?.length ?? 0,
    created: viewQueries[2]?.data?.tasks?.length ?? 0,
  };
  const overdueCount = (viewQueries[1]?.data?.tasks ?? []).filter((row) => row.is_overdue).length;

  const detailTask = useMemo(() => {
    if (!detailTaskId) return null;
    for (const q of viewQueries) {
      const found = (q.data?.tasks ?? []).find((task) => task.id === detailTaskId);
      if (found) return found;
    }
    return null;
  }, [detailTaskId, viewQueries]);

  const eventsQuery = useQuery({
    queryKey: ["daily-tasks", "events", detailTaskId ?? ""],
    queryFn: () => getDailyTaskEvents(detailTaskId!),
    enabled: Boolean(detailTaskId),
  });

  const invalidateTasks = () => void queryClient.invalidateQueries({ queryKey: ["daily-tasks"] });

  const createMut = useMutation({
    mutationFn: (payload: CreateDailyTaskPayload) => createDailyTask(payload),
    onSuccess: () => {
      pushToast("Task created", "success");
      setCreateOpen(false);
      setTitle("");
      setDescription("");
      setDueLocal("");
      setPriority("normal");
      invalidateTasks();
    },
    onError: (error) => pushToast(String((error as Error).message ?? "Create failed"), "error"),
  });

  const acceptMut = useMutation({
    mutationFn: (id: string) => acceptDailyTask(id),
    onSuccess: () => {
      pushToast("Task accepted", "success");
      invalidateTasks();
    },
    onError: (error) => pushToast(String((error as Error).message ?? "Accept failed"), "error"),
  });

  const completeMut = useMutation({
    mutationFn: (id: string) => completeDailyTask(id),
    onSuccess: () => {
      pushToast("Task completed", "success");
      invalidateTasks();
    },
    onError: (error) => pushToast(String((error as Error).message ?? "Complete failed"), "error"),
  });

  const submitCreate = async () => {
    if (!companyId || !userId) return;
    if (!title.trim()) {
      pushToast("Title is required", "error");
      return;
    }
    if (!assignedToUserId) {
      pushToast("Assignee is required", "error");
      return;
    }
    const dueIso = dueLocal ? new Date(dueLocal).toISOString() : null;
    await createMut.mutateAsync({
      operating_company_id: companyId,
      title: title.trim(),
      description: description.trim() ? description.trim() : null,
      assigned_to_user_id: assignedToUserId,
      priority,
      due_at: dueIso,
    });
  };

  const currentTimeZone = new Intl.DateTimeFormat().resolvedOptions().timeZone || "Local time";

  return (
    <div className="space-y-3">
      <PageHeader
        title="Daily Tasks"
        subtitle={`Team execution board · ${currentTimeZone}`}
        actions={
          <Button
            type="button"
            onClick={() => {
              setAssignedToUserId(userId);
              setCreateOpen(true);
            }}
          >
            + Create
          </Button>
        }
      />

      <div className="rounded border border-slate-200 bg-white px-3 py-2">
        <div className="mb-2 flex items-center justify-between">
          <div className="text-xs text-slate-600">View</div>
          <div className="inline-flex items-center gap-1 rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 text-[11px] font-semibold text-rose-700">
            <AlertTriangle className="h-3.5 w-3.5" />
            Alerts {overdueCount} overdue
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {VIEW_ORDER.map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => setView(id)}
              className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-semibold ${
                view === id ? "border-[#1f2a44] bg-[#1f2a44] text-white" : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
              }`}
            >
              {VIEW_LABEL[id]}
              <span className={`rounded-full px-1.5 py-0.5 text-[10px] ${view === id ? "bg-white/20 text-white" : "bg-slate-100 text-slate-700"}`}>
                {tabCounts[id]}
              </span>
              {id === "team" && overdueCount > 0 ? <span className="rounded-full bg-red-600 px-1.5 py-0.5 text-[10px] text-white">{overdueCount}</span> : null}
            </button>
          ))}
        </div>
      </div>

      {!companyId ? (
        <div className="rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">Select an operating company first.</div>
      ) : null}

      <div className="overflow-x-auto rounded border border-slate-200 bg-white">
        <table className="min-w-full text-left text-xs">
          <thead className="border-b border-slate-200 bg-slate-50 text-[11px] uppercase tracking-wide text-slate-600">
            <tr>
              <th className="px-3 py-2">Task</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Assignee</th>
              <th className="px-3 py-2">Due</th>
              <th className="px-3 py-2">Timestamps</th>
              <th className="px-3 py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {activeRows.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-sm text-slate-500">
                  No tasks in this view.
                </td>
              </tr>
            ) : null}
            {activeRows.map((task) => {
              const canAccept = task.status === "created" && task.assigned_to_user_id === userId;
              const canComplete = task.status === "accepted" && task.assigned_to_user_id === userId;
              return (
                <tr
                  key={task.id}
                  data-testid={`task-row-${task.id}`}
                  className={`border-b border-slate-100 align-top ${task.is_overdue ? "bg-red-50/60" : "bg-white"}`}
                >
                  <td className="px-3 py-2">
                    <div className="flex items-start gap-2">
                      <ListChecks className="mt-0.5 h-4 w-4 text-slate-500" />
                      <div>
                        <button type="button" className="text-left font-semibold text-slate-900 hover:underline" onClick={() => setDetailTaskId(task.id)}>
                          {task.title}
                        </button>
                        {task.description ? <p className="mt-0.5 text-slate-600">{task.description}</p> : null}
                        <div className="mt-1 flex flex-wrap items-center gap-1">
                          <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${priorityBadge(task.priority)}`}>
                            {task.priority.toUpperCase()}
                          </span>
                          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-700">{STATUS_STEPS[task.status]}</span>
                          {task.is_overdue ? (
                            <span className="rounded-full bg-red-600 px-2 py-0.5 text-[10px] font-semibold text-white">Overdue</span>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${statusBadge(task.status)}`}>{task.status.toUpperCase()}</span>
                  </td>
                  <td className="px-3 py-2">
                    <div className="inline-flex items-center gap-1 text-slate-700">
                      <UserRound className="h-3.5 w-3.5" />
                      <span>{task.assigned_to_email || task.assigned_to_user_id}</span>
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    <div>{formatDateTime(task.due_at)}</div>
                  </td>
                  <td className="px-3 py-2 text-slate-700">
                    <div>Created: {formatDateTime(task.created_at)}</div>
                    {task.accepted_at ? <div>Accepted: {formatDateTime(task.accepted_at)}</div> : null}
                    {task.completed_at ? <div>Completed: {formatDateTime(task.completed_at)}</div> : null}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap gap-1">
                      {canAccept ? (
                        <Button size="sm" type="button" loading={acceptMut.isPending} onClick={() => acceptMut.mutate(task.id)}>
                          Accept
                        </Button>
                      ) : null}
                      {canComplete ? (
                        <Button size="sm" type="button" loading={completeMut.isPending} onClick={() => completeMut.mutate(task.id)}>
                          Complete
                        </Button>
                      ) : null}
                      <Button size="sm" variant="secondary" type="button" onClick={() => setDetailTaskId(task.id)}>
                        Details
                      </Button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Quick Create Task">
        <div className="space-y-3 text-xs">
          <div>
            <label htmlFor="daily-task-title" className="mb-1 block text-[11px] font-semibold uppercase text-slate-600">
              Title
            </label>
            <input
              id="daily-task-title"
              className="w-full rounded border border-slate-300 px-2 py-1.5"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Call 40 drivers today"
            />
          </div>
          <div>
            <label htmlFor="daily-task-description" className="mb-1 block text-[11px] font-semibold uppercase text-slate-600">
              Description
            </label>
            <textarea
              id="daily-task-description"
              className="min-h-[84px] w-full rounded border border-slate-300 px-2 py-1.5"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Include scope, dependencies, and expected output."
            />
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div>
              <label htmlFor="daily-task-assignee" className="mb-1 block text-[11px] font-semibold uppercase text-slate-600">
                Assignee
              </label>
              <SelectCombobox
                id="daily-task-assignee"
                className="w-full rounded border border-slate-300 px-2 py-1.5"
                value={assignedToUserId}
                onChange={(event) => setAssignedToUserId(event.target.value)}
              >
                <option value="">Select employee</option>
                {activeUsers.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.email ?? user.id}
                  </option>
                ))}
              </SelectCombobox>
            </div>
            <div>
              <label htmlFor="daily-task-priority" className="mb-1 block text-[11px] font-semibold uppercase text-slate-600">
                Priority
              </label>
              <SelectCombobox
                id="daily-task-priority"
                className="w-full rounded border border-slate-300 px-2 py-1.5"
                value={priority}
                onChange={(event) => setPriority(event.target.value as DailyTask["priority"])}
              >
                {PRIORITY_OPTIONS.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </SelectCombobox>
            </div>
          </div>
          <div>
            <label htmlFor="daily-task-due" className="mb-1 block text-[11px] font-semibold uppercase text-slate-600">
              Due Date / Time
            </label>
            <input
              id="daily-task-due"
              type="datetime-local"
              className="w-full rounded border border-slate-300 px-2 py-1.5"
              value={dueLocal}
              onChange={(event) => setDueLocal(event.target.value)}
              min={toDateTimeLocalValue(new Date(Date.now() - 60_000))}
            />
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="secondary" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button type="button" loading={createMut.isPending} onClick={() => void submitCreate()}>
              + Create
            </Button>
          </div>
        </div>
      </Modal>

      {detailTaskId ? (
        <TaskDetailDrawer task={detailTask} events={eventsQuery.data?.events ?? []} onClose={() => setDetailTaskId(null)} />
      ) : null}
    </div>
  );
}

function TaskDetailDrawer({
  task,
  events,
  onClose,
}: {
  task: DailyTask | null;
  events: DailyTaskEvent[];
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-40">
      <button type="button" aria-label="Close detail drawer" className="absolute inset-0 bg-black/30" onClick={onClose} />
      <aside className="absolute right-0 top-0 h-full w-full max-w-[520px] overflow-y-auto border-l border-slate-200 bg-white p-4 shadow-2xl">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-700">Task Detail</h2>
          <Button size="sm" variant="secondary" onClick={onClose}>
            Close
          </Button>
        </div>
        {!task ? (
          <div className="rounded border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">Loading task details…</div>
        ) : (
          <div className="space-y-3 text-xs">
            <div className="rounded border border-slate-200 bg-slate-50 p-3">
              <div className="text-sm font-semibold text-slate-900">{task.title}</div>
              {task.description ? <p className="mt-1 text-slate-700">{task.description}</p> : null}
              <div className="mt-2 grid grid-cols-1 gap-1 text-slate-700">
                <div>Status: {task.status}</div>
                <div>Progress: {STATUS_STEPS[task.status]}</div>
                <div>Priority: {task.priority}</div>
                <div>Assignee: {task.assigned_to_email || task.assigned_to_user_id}</div>
                <div>Due: {formatDateTime(task.due_at)}</div>
                <div>Created: {formatDateTime(task.created_at)}</div>
                <div>Accepted: {formatDateTime(task.accepted_at)}</div>
                <div>Completed: {formatDateTime(task.completed_at)}</div>
              </div>
            </div>
            <div>
              <div className="mb-2 inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-slate-600">
                <Clock3 className="h-3.5 w-3.5" />
                Activity Timeline
              </div>
              <div className="space-y-2">
                {events.length === 0 ? (
                  <div className="rounded border border-slate-200 bg-white p-3 text-slate-500">No activity events yet.</div>
                ) : null}
                {events.map((event) => (
                  <div key={event.id} className="rounded border border-slate-200 bg-white p-3">
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-700">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        {event.event_type}
                      </span>
                      <span className="text-[10px] text-slate-500">{formatDateTime(event.created_at)}</span>
                    </div>
                    <div className="text-[11px] text-slate-700">Actor: {event.actor_user_id}</div>
                    {Object.keys(event.payload ?? {}).length > 0 ? (
                      <pre className="mt-2 overflow-x-auto rounded bg-slate-50 p-2 text-[10px] text-slate-600">
                        {JSON.stringify(event.payload, null, 2)}
                      </pre>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </aside>
    </div>
  );
}
