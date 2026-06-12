import { apiRequest } from "./client";

export type TaskStatus = "pending" | "in_progress" | "blocked" | "review" | "completed" | "cancelled";
export type TaskCategory = "load" | "maintenance" | "safety" | "dispatch" | "admin";

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
  estimated_minutes: number | null;
  actual_minutes: number | null;
  progress_pct: number;
  task_type_id: string | null;
  task_type_name: string | null;
  start_time: string | null;
  location: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type TaskType = { id: string; name: string; is_active: boolean };

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
};

export async function fetchPlannerTasks(params: {
  operating_company_id: string;
  date_from: string;
  date_to: string;
  assigned_to?: string;
}) {
  const q = new URLSearchParams({ operating_company_id: params.operating_company_id, date_from: params.date_from, date_to: params.date_to });
  if (params.assigned_to) q.set("assigned_to", params.assigned_to);
  return apiRequest<PlannerData>(`/api/v1/tasks/planner?${q}`);
}

export async function fetchTaskTypes(operating_company_id: string) {
  return apiRequest<{ types: TaskType[] }>(`/api/v1/tasks/types?operating_company_id=${encodeURIComponent(operating_company_id)}`);
}

export async function createTaskType(operating_company_id: string, name: string) {
  return apiRequest<{ type: TaskType }>("/api/v1/tasks/types", { method: "POST", body: JSON.stringify({ operating_company_id, name }) });
}

export async function createTask(input: CreateTaskInput) {
  return apiRequest<{ task: Task }>("/api/v1/tasks", { method: "POST", body: JSON.stringify(input) });
}

export async function updateTaskProgress(task_id: string, progress_pct: number) {
  return apiRequest<{ task: { task_id: string; progress_pct: number } }>(`/api/v1/tasks/${task_id}/progress`, {
    method: "PATCH",
    body: JSON.stringify({ progress_pct }),
  });
}
