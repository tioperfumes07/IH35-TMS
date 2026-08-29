import { apiRequest } from "./client";

export type TaskStatus = "pending" | "in_progress" | "blocked" | "review" | "completed" | "cancelled";
export type TaskCategory = "load" | "maintenance" | "safety" | "dispatch" | "admin";

// TASKS-PLANNER-V2-CONNECTIVITY — polymorphic record-link kinds (mirror tasks.task_link CHECK).
export type TaskTargetType =
  | "vendor" | "customer" | "unit" | "driver" | "expense" | "bill" | "bill_payment"
  | "purchase" | "work_order" | "policy" | "load" | "settlement" | "document";

export const TASK_TARGET_TYPES: TaskTargetType[] = [
  "vendor", "customer", "unit", "driver", "expense", "bill", "bill_payment",
  "purchase", "work_order", "policy", "load", "settlement", "document",
];

export type TaskLinkRole = "about" | "result";

export type TaskLink = {
  id: string;
  task_id: string;
  role: TaskLinkRole;
  target_type: TaskTargetType;
  target_id: string;
  note: string | null;
  created_at: string;
  created_by_user_id: string | null;
};

export type TaskLinkInput = {
  role?: TaskLinkRole;
  target_type: TaskTargetType;
  target_id: string;
  note?: string;
};

export type Task = {
  task_id: string;
  category: TaskCategory;
  status: TaskStatus;
  title: string;
  priority: number;
  scheduled_date: string;
  assigned_to_user_id: string;
  assigned_to_email: string | null;
  assigned_to_name: string | null;
  subject_type: string | null;
  subject_id: string | null;
  subject_label: string | null;
  estimated_minutes: number | null;
  actual_minutes: number | null;
  progress_pct: number;
  task_type_id: string | null;
  task_type_name: string | null;
  start_time: string | null;
  location: string | null;
  notes: string | null;
  alarm_at: string | null;
  anticipated_category: string | null;
  created_at: string;
  updated_at: string;
};

// TASKS-PLANNER-V2-CONNECTIVITY — task_type is now a PROFILE.
export type TaskType = {
  id: string;
  name: string;
  is_active: boolean;
  category?: string | null;
  description?: string | null;
  default_link_kinds?: TaskTargetType[] | null;
  alarm_lead_days?: number | null;
};

export type PlannerData = {
  date_from: string;
  date_to: string;
  tasks: Task[];
  by_employee: Record<string, Task[]>;
  count: number;
};

export type CreateTaskInput = {
  operating_company_id: string;
  category: TaskCategory;
  title: string;
  description?: string;
  assigned_to_user_id: string;
  scheduled_date: string;
  due_date?: string;
  priority?: number;
  progress_pct?: number;
  task_type_id?: string;
  start_time?: string;
  location?: string;
  checkin_cadence_minutes?: number;
  escalate_to_user_id?: string;
  notes?: string;
  // TASKS-PLANNER-V2-CONNECTIVITY
  alarm_at?: string; // ISO datetime with offset
  anticipated_category?: string;
  links?: TaskLinkInput[];
};

export async function fetchPlannerTasks(params: {
  operating_company_id: string;
  date_from: string;
  date_to: string;
  assigned_to?: string;
}, signal?: AbortSignal) {
  const q = new URLSearchParams({ operating_company_id: params.operating_company_id, date_from: params.date_from, date_to: params.date_to });
  if (params.assigned_to) q.set("assigned_to", params.assigned_to);
  return apiRequest<PlannerData>(`/api/v1/tasks/planner?${q}`, { signal });
}

/** Generic task list (no date range required) — used by the completion picker to show OPEN tasks. */
export async function fetchTasks(params: {
  operating_company_id: string;
  status?: TaskStatus;
  category?: TaskCategory;
  limit?: number;
}) {
  const q = new URLSearchParams({ operating_company_id: params.operating_company_id });
  if (params.status) q.set("status", params.status);
  if (params.category) q.set("category", params.category);
  if (params.limit != null) q.set("limit", String(params.limit));
  return apiRequest<{ tasks: Task[]; total_count: number }>(`/api/v1/tasks?${q}`);
}

// GO-0044-TASKS-CHAT-DEEP-LINK-HEADER-CONTEXT-LOSS: TasksChatPage's task picker only fetches a
// fixed +/-45-day window (fetchPlannerTasks) -- a deep link to a task outside that window (the
// Planner's own overdue-rollover logic, or a "This Year"/custom date-range preset can surface one)
// left the chat header silently degraded to a bare "Task" label with no date/status/subject-link,
// even though the comments/activity threads themselves loaded and posted fine. This single-task
// fetch lets the page resolve exactly the deep-linked task regardless of the picker's window.
export async function fetchTask(task_id: string, operating_company_id: string, signal?: AbortSignal) {
  return apiRequest<{ task: Task }>(
    `/api/v1/tasks/${encodeURIComponent(task_id)}?operating_company_id=${encodeURIComponent(operating_company_id)}`,
    { signal },
  );
}

export async function fetchTaskTypes(operating_company_id: string) {
  return apiRequest<{ types: TaskType[] }>(`/api/v1/tasks/types?operating_company_id=${encodeURIComponent(operating_company_id)}`);
}

export async function createTaskType(
  operating_company_id: string,
  name: string,
  profile?: { category?: string; description?: string; default_link_kinds?: TaskTargetType[]; alarm_lead_days?: number }
) {
  // Pass the raw object; apiRequest does the single JSON.stringify. (Double-stringify => 400 "expected object, received string".)
  return apiRequest<{ type: TaskType }>("/api/v1/tasks/types", {
    method: "POST",
    body: { operating_company_id, name, ...(profile ?? {}) },
  });
}

export async function createTask(input: CreateTaskInput) {
  // Pass the raw object; apiRequest does the single JSON.stringify. (Double-stringify => 400 "expected object, received string".)
  return apiRequest<{ task: Task }>("/api/v1/tasks", { method: "POST", body: input });
}

export async function updateTaskProgress(task_id: string, operating_company_id: string, progress_pct: number) {
  const q = new URLSearchParams({ operating_company_id });
  return apiRequest<{ task: { task_id: string; progress_pct: number } }>(`/api/v1/tasks/${task_id}/progress?${q}`, {
    method: "PATCH",
    body: { progress_pct },
  });
}

// ── TASKS-PLANNER-V2-CONNECTIVITY: record links + transaction-side completion ────────────────────

/** Tasks linked to a given record (powers the per-entity "Tasks" tab). */
export async function fetchTasksByTarget(params: {
  operating_company_id: string;
  target_type: TaskTargetType;
  target_id: string;
  status?: TaskStatus;
}) {
  const q = new URLSearchParams({
    operating_company_id: params.operating_company_id,
    target_type: params.target_type,
    target_id: params.target_id,
  });
  if (params.status) q.set("status", params.status);
  return apiRequest<{ tasks: Task[]; total_count: number }>(`/api/v1/tasks?${q}`);
}

export async function fetchTaskLinks(task_id: string, operating_company_id: string) {
  const q = new URLSearchParams({ operating_company_id });
  return apiRequest<{ links: TaskLink[] }>(`/api/v1/tasks/${task_id}/links?${q}`);
}

/**
 * Link a record to a task. role='result' (default) CLOSES the task — the transaction-side
 * completion path (the new expense/bill/policy that fulfils the request marks it done).
 * Pure pointer: never an accounting write.
 */
export async function createTaskLink(task_id: string, operating_company_id: string, input: TaskLinkInput) {
  const q = new URLSearchParams({ operating_company_id });
  return apiRequest<{ link: TaskLink; task: Task | null }>(`/api/v1/tasks/${task_id}/links?${q}`, {
    method: "POST",
    body: input,
  });
}

// ── TASK-3 Team Chat (task-scoped collaboration) ────────────────────────────────────────────────
export type TaskComment = {
  id: string;
  task_id: string;
  author_user_id: string;
  body: string;
  mentions: string[];
  created_at: string;
  author_email: string | null;
  author_name: string | null;
};

export type TaskActivity = {
  id: string;
  task_id: string;
  actor_user_id: string | null;
  event_type: "comment" | "status_change" | "assignment" | "link_added";
  payload: Record<string, unknown>;
  created_at: string;
  actor_name: string | null;
};

export async function fetchTaskComments(task_id: string, operating_company_id: string, signal?: AbortSignal) {
  const q = new URLSearchParams({ operating_company_id });
  return apiRequest<{ comments: TaskComment[] }>(`/api/v1/tasks/${task_id}/comments?${q}`, { signal });
}

export async function createTaskComment(task_id: string, operating_company_id: string, body: string, mentions: string[]) {
  // Pass the raw object; apiRequest does the single JSON.stringify.
  const q = new URLSearchParams({ operating_company_id });
  return apiRequest<{ comment: TaskComment }>(`/api/v1/tasks/${task_id}/comments?${q}`, {
    method: "POST",
    body: { body, mentions },
  });
}

export async function fetchTaskActivity(task_id: string, operating_company_id: string, signal?: AbortSignal) {
  const q = new URLSearchParams({ operating_company_id });
  return apiRequest<{ activity: TaskActivity[] }>(`/api/v1/tasks/${task_id}/activity?${q}`, { signal });
}
