import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { TasksReportPage } from "./TasksReportPage";
import type { Task } from "../../api/tasks";

const fetchPlannerTasks = vi.fn();

vi.mock("../../api/tasks", async (orig) => {
  const actual = await orig<typeof import("../../api/tasks")>();
  return { ...actual, fetchPlannerTasks: (...args: unknown[]) => fetchPlannerTasks(...args) };
});

vi.mock("../../contexts/CompanyContext", () => ({
  useCompanyContext: () => ({ selectedCompanyId: "91e0bf0a-133f-4ce8-a734-2586cfa66d96" }),
}));

vi.mock("./TasksModuleTabs", () => ({ TasksModuleTabs: () => null }));

function makeTask(overrides: Partial<Task>): Task {
  return {
    task_id: "t-" + Math.random(),
    category: "admin",
    status: "completed",
    title: "Task",
    priority: 0,
    scheduled_date: "2026-08-25",
    assigned_to_user_id: "u1",
    assigned_to_email: "a@x.com",
    assigned_to_name: "Alex",
    subject_type: null,
    subject_id: null,
    subject_label: null,
    estimated_minutes: null,
    actual_minutes: null,
    progress_pct: 100,
    task_type_id: null,
    task_type_name: null,
    start_time: null,
    location: null,
    notes: null,
    alarm_at: null,
    anticipated_category: null,
    created_at: "2026-08-25T00:00:00Z",
    updated_at: "2026-08-25T00:00:00Z",
    ...overrides,
  };
}

function renderReport() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <TasksReportPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

// GO-0044-TASKS-REPORT-OVERDUE-ROLLOVER-CONTAMINATION: /tasks/planner intentionally includes any
// still-open task scheduled before date_from, unbounded (so the Planner grid never hides old open
// work) -- correct there, but wrong on this page, which presents an explicit period-bounded
// "Window: 7d/30d/90d" contract. Without filtering to the selected window, a task scheduled a
// year ago that's still open would be counted in every window size, silently deflating the
// completion rate and making the Window filter not actually change the denominator.
describe("TasksReportPage — period-bounded stats (GO-0044)", () => {
  it("excludes an unbounded rollover task (scheduled far outside the window) from Total/Completion stats", async () => {
    fetchPlannerTasks.mockResolvedValue({
      tasks: [
        // Two genuinely in-window tasks (one completed, one open) -- scheduled_date is inside the
        // 30-day default window ending "today".
        makeTask({ task_id: "in-1", status: "completed", scheduled_date: "2026-08-20" }),
        makeTask({ task_id: "in-2", status: "pending", scheduled_date: "2026-08-22" }),
        // A rollover task the backend includes unbounded because it's still open, but scheduled
        // 400 days before the window -- must NOT be counted here.
        makeTask({ task_id: "rollover-1", status: "pending", scheduled_date: "2025-07-01" }),
      ],
    });

    renderReport();

    // Completion rate: 1 of 2 in-window tasks completed == 50%, not 1 of 3 == 33%.
    expect(await screen.findByText("50%")).toBeInTheDocument();
    // Scope to the "Total tasks" stat tile specifically -- "2" alone is ambiguous elsewhere on
    // the page (e.g. a ParityTable row-count badge).
    const totalLabel = screen.getByText("Total tasks");
    expect(totalLabel.parentElement).toHaveTextContent("2");
    expect(totalLabel.parentElement).not.toHaveTextContent("3");
  });
});
