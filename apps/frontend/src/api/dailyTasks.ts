import { apiRequest } from "./client";

export type DailyTaskStatus = "created" | "accepted" | "completed" | "cancelled";
export type DailyTaskPriority = "low" | "normal" | "high" | "urgent";
export type DailyTaskEventType = "created" | "accepted" | "completed" | "cancelled" | "reassigned" | "comment";

export type DailyTask = {
  id: string;
  operating_company_id: string;
  title: string;
  description: string | null;
  created_by_user_id: string;
  assigned_to_user_id: string;
  assigned_to_email?: string | null;
  created_by_email?: string | null;
  status: DailyTaskStatus;
  priority: DailyTaskPriority;
  due_at: string | null;
  accepted_at: string | null;
  completed_at: string | null;
  cancelled_at: string | null;
  cancellation_reason: string | null;
  created_at: string;
  updated_at: string;
  is_overdue?: boolean;
};

export type DailyTaskEvent = {
  id: string;
  operating_company_id: string;
  daily_task_id: string;
  event_type: DailyTaskEventType;
  actor_user_id: string;
  payload: Record<string, unknown>;
  created_at: string;
};

export type CreateDailyTaskPayload = {
  operating_company_id: string;
  title: string;
  description?: string | null;
  assigned_to_user_id: string;
  priority?: DailyTaskPriority;
  due_at?: string | null;
};

export type ListDailyTaskFilters = {
  operating_company_id: string;
  assignee?: string;
  created_by?: string;
  team?: string;
  status?: DailyTaskStatus;
  date?: string;
  overdue?: boolean;
};

function qs(filters: ListDailyTaskFilters): string {
  const query = new URLSearchParams({ operating_company_id: filters.operating_company_id });
  if (filters.assignee) query.set("assignee", filters.assignee);
  if (filters.created_by) query.set("created_by", filters.created_by);
  if (filters.team) query.set("team", filters.team);
  if (filters.status) query.set("status", filters.status);
  if (filters.date) query.set("date", filters.date);
  if (typeof filters.overdue === "boolean") query.set("overdue", String(filters.overdue));
  return query.toString();
}

export function createDailyTask(payload: CreateDailyTaskPayload) {
  return apiRequest<{ task: DailyTask }>("/api/v1/daily-tasks", { method: "POST", body: payload });
}

export function listDailyTasks(filters: ListDailyTaskFilters) {
  return apiRequest<{ tasks: DailyTask[] }>(`/api/v1/daily-tasks?${qs(filters)}`);
}

export function getDailyTask(id: string) {
  return apiRequest<{ task: DailyTask }>(`/api/v1/daily-tasks/${id}`);
}

export function acceptDailyTask(id: string) {
  return apiRequest<{ task: DailyTask }>(`/api/v1/daily-tasks/${id}/accept`, { method: "POST" });
}

export function completeDailyTask(id: string) {
  return apiRequest<{ task: DailyTask }>(`/api/v1/daily-tasks/${id}/complete`, { method: "POST" });
}

export function reassignDailyTask(id: string, assignedToUserId: string) {
  return apiRequest<{ task: DailyTask }>(`/api/v1/daily-tasks/${id}/reassign`, {
    method: "POST",
    body: { assigned_to_user_id: assignedToUserId },
  });
}

export function cancelDailyTask(id: string, cancellationReason: string) {
  return apiRequest<{ task: DailyTask }>(`/api/v1/daily-tasks/${id}/cancel`, {
    method: "POST",
    body: { cancellation_reason: cancellationReason },
  });
}

export function getDailyTaskEvents(id: string) {
  return apiRequest<{ events: DailyTaskEvent[] }>(`/api/v1/daily-tasks/${id}/events`);
}
