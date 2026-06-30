import type { TaskStatus } from "../../api/tasks";

// Shared task status/priority display tokens (kept in sync with TaskPlannerGrid). §7 palette:
// slate/gray/green, red only for blocked/urgent.
export const TASK_STATUS_BADGE: Record<TaskStatus, string> = {
  pending: "bg-gray-100 text-gray-700 border-gray-300",
  in_progress: "bg-slate-100 text-slate-700 border-slate-300",
  blocked: "bg-red-50 text-red-800 border-red-300",
  review: "bg-yellow-50 text-yellow-800 border-yellow-300",
  completed: "bg-green-50 text-green-800 border-green-300",
  cancelled: "bg-gray-50 text-gray-400 border-gray-200 line-through",
};

export function taskStatusLabel(status: TaskStatus): string {
  return status.replace(/_/g, " ");
}

export function priorityLabel(priority: number): string {
  return priority >= 2 ? "Urgent" : priority === 1 ? "High" : "Normal";
}

export function isOpenTaskStatus(status: TaskStatus): boolean {
  return status !== "completed" && status !== "cancelled";
}
