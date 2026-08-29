import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TasksChatPage } from "./TasksChatPage";
import type { Task } from "../../api/tasks";

const fetchPlannerTasks = vi.fn();
const fetchTask = vi.fn();
const fetchTaskComments = vi.fn();
const fetchTaskActivity = vi.fn();
const createTaskComment = vi.fn();

vi.mock("../../api/tasks", async (orig) => {
  const actual = await orig<typeof import("../../api/tasks")>();
  return {
    ...actual,
    fetchPlannerTasks: (...args: unknown[]) => fetchPlannerTasks(...args),
    fetchTask: (...args: unknown[]) => fetchTask(...args),
    fetchTaskComments: (...args: unknown[]) => fetchTaskComments(...args),
    fetchTaskActivity: (...args: unknown[]) => fetchTaskActivity(...args),
    createTaskComment: (...args: unknown[]) => createTaskComment(...args),
  };
});

vi.mock("../../api/identity", () => ({
  listAssignableUsers: vi.fn().mockResolvedValue({ users: [] }),
}));

vi.mock("../../contexts/CompanyContext", () => ({
  useCompanyContext: () => ({ selectedCompanyId: "91e0bf0a-133f-4ce8-a734-2586cfa66d96" }),
}));

vi.mock("./TasksModuleTabs", () => ({ TasksModuleTabs: () => null }));

const DEEP_LINKED_TASK: Task = {
  task_id: "old-task-1",
  category: "admin",
  status: "pending",
  title: "Renew IFTA permit",
  priority: 0,
  scheduled_date: "2025-01-15",
  assigned_to_user_id: "u1",
  assigned_to_email: "a@x.com",
  assigned_to_name: "Alex",
  subject_type: null,
  subject_id: null,
  subject_label: null,
  estimated_minutes: null,
  actual_minutes: null,
  progress_pct: 0,
  task_type_id: null,
  task_type_name: null,
  start_time: null,
  location: null,
  notes: null,
  alarm_at: null,
  anticipated_category: null,
  created_at: "2025-01-15T00:00:00Z",
  updated_at: "2025-01-15T00:00:00Z",
};

function renderChat(taskId: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[`/tasks/chat?taskId=${taskId}`]}>
        <TasksChatPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

// GO-0044-TASKS-CHAT-DEEP-LINK-HEADER-CONTEXT-LOSS: the picker only fetches a fixed +/-45-day
// window -- a deep link to a task scheduled outside that window used to silently degrade the
// header to a bare "Task" label with no date/status/subject-link, even though comments/activity
// still worked. The page must now fall back to a single-task fetch for exactly that task.
describe("TasksChatPage — deep link outside the picker window (GO-0044)", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("resolves the real task title/date/status via the single-task fallback when the task is outside the +/-45-day picker window", async () => {
    // The picker window comes back empty -- the deep-linked task is NOT in it.
    fetchPlannerTasks.mockResolvedValue({ tasks: [] });
    fetchTask.mockResolvedValue({ task: DEEP_LINKED_TASK });
    fetchTaskComments.mockResolvedValue({ comments: [] });
    fetchTaskActivity.mockResolvedValue({ activity: [] });

    renderChat("old-task-1");

    expect(await screen.findByText("Renew IFTA permit")).toBeInTheDocument();
    expect(fetchTask).toHaveBeenCalledWith("old-task-1", "91e0bf0a-133f-4ce8-a734-2586cfa66d96", expect.anything());
    // Never the silent fallback label once the real task resolves.
    expect(screen.queryByText("Task", { selector: ".text-sm.font-semibold" })).not.toBeInTheDocument();
  });

  it("skips the fallback fetch entirely when the task IS already in the picker window", async () => {
    const inWindowTask: Task = { ...DEEP_LINKED_TASK, task_id: "in-window-1", scheduled_date: "2026-08-25", title: "In-window task" };
    fetchPlannerTasks.mockResolvedValue({ tasks: [inWindowTask] });
    fetchTaskComments.mockResolvedValue({ comments: [] });
    fetchTaskActivity.mockResolvedValue({ activity: [] });

    renderChat("in-window-1");

    // "In-window task" appears twice (the picker sidebar list AND the selected header) -- scope
    // to the header specifically.
    await screen.findAllByText("In-window task");
    expect(document.querySelector(".text-sm.font-semibold.text-\\[\\#1f2a44\\]")).toHaveTextContent("In-window task");
    expect(fetchTask).not.toHaveBeenCalled();
  });
});
