import type { TaskStatus } from "../../api/tasks";

// Shared task status/priority display tokens (kept in sync with TaskPlannerGrid). §7 palette:
// slate/gray/green, red only for blocked/urgent.
export const TASK_STATUS_BADGE: Record<TaskStatus, string> = {
  pending: "bg-gray-100 text-gray-700 border-gray-300",
  in_progress: "bg-[#F7F8FA] text-[#1F2A44] border-[#E5E7EB]",
  blocked: "bg-red-50 text-red-800 border-red-300",
  review: "bg-[#F7F8FA] text-[#1F2A44] border-[#E5E7EB]",
  completed: "bg-[#F7F8FA] text-[#0F1219] border-[#E5E7EB]",
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
