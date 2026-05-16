import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactElement } from "react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as dailyTasksApi from "../../api/dailyTasks";
import type { DailyTask } from "../../api/dailyTasks";
import * as identityApi from "../../api/identity";
import { ToastProvider } from "../../components/Toast";
import { DailyTasksPage } from "./DailyTasksPage";

vi.mock("../../contexts/CompanyContext", () => ({
  useCompanyContext: () => ({
    selectedCompanyId: "91f6d7d8-0f3a-4c2d-8e1b-2c3d4e5f6071",
    companies: [],
    selectedCompany: null,
    isLoading: false,
    setSelectedCompany: vi.fn(),
    setDefaultCompanyForUser: vi.fn(async () => undefined),
  }),
}));

vi.mock("../../auth/useAuth", () => ({
  useAuth: () => ({
    user: {
      uuid: "f47ac10b-58cc-4372-a567-0e02b2c3d479",
      email: "integration.owner@test.invalid",
      role: "Owner",
    },
    session: { id: "session-1" },
    isLoading: false,
    isUnauthenticated: false,
    refetch: vi.fn(),
  }),
}));

function makeTask(input: Partial<DailyTask> & Pick<DailyTask, "id" | "title" | "assigned_to_user_id" | "created_by_user_id">): DailyTask {
  return {
    id: input.id,
    operating_company_id: "91f6d7d8-0f3a-4c2d-8e1b-2c3d4e5f6071",
    title: input.title,
    description: input.description ?? null,
    created_by_user_id: input.created_by_user_id,
    assigned_to_user_id: input.assigned_to_user_id,
    assigned_to_email: input.assigned_to_email ?? "assignee@test.invalid",
    created_by_email: input.created_by_email ?? "creator@test.invalid",
    status: input.status ?? "created",
    priority: input.priority ?? "normal",
    due_at: input.due_at ?? null,
    accepted_at: input.accepted_at ?? null,
    completed_at: input.completed_at ?? null,
    cancelled_at: input.cancelled_at ?? null,
    cancellation_reason: input.cancellation_reason ?? null,
    created_at: input.created_at ?? "2026-05-16T12:00:00Z",
    updated_at: input.updated_at ?? "2026-05-16T12:00:00Z",
    is_overdue: input.is_overdue ?? false,
  };
}

function wrap(ui: ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={qc}>
      <ToastProvider>
        <MemoryRouter>{ui}</MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>
  );
}

describe("DailyTasksPage", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("supports create -> accept -> complete, shows overdue badge/highlight, and renders timeline drawer", async () => {
    const user = userEvent.setup();
    const state = {
      myStatus: "created" as DailyTask["status"],
      acceptedAt: null as string | null,
      completedAt: null as string | null,
    };

    vi.spyOn(identityApi, "listUsers").mockResolvedValue({
      users: [
        {
          id: "f47ac10b-58cc-4372-a567-0e02b2c3d479",
          email: "integration.owner@test.invalid",
          role: "Owner",
          created_at: "2026-01-01T00:00:00Z",
          deactivated_at: null,
        },
        {
          id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1",
          email: "dispatcher@test.invalid",
          role: "Dispatcher",
          created_at: "2026-01-01T00:00:00Z",
          deactivated_at: null,
        },
      ],
    } as Awaited<ReturnType<typeof identityApi.listUsers>>);

    vi.spyOn(dailyTasksApi, "listDailyTasks").mockImplementation(async (filters) => {
      if (filters.assignee) {
        return {
          tasks: [
            makeTask({
              id: "task-my-1",
              title: "Call 40 drivers today",
              created_by_user_id: "f47ac10b-58cc-4372-a567-0e02b2c3d479",
              assigned_to_user_id: "f47ac10b-58cc-4372-a567-0e02b2c3d479",
              assigned_to_email: "integration.owner@test.invalid",
              status: state.myStatus,
              accepted_at: state.acceptedAt,
              completed_at: state.completedAt,
            }),
          ],
        };
      }
      if (filters.created_by) {
        return {
          tasks: [
            makeTask({
              id: "task-created-1",
              title: "Created by me sample",
              created_by_user_id: "f47ac10b-58cc-4372-a567-0e02b2c3d479",
              assigned_to_user_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1",
              assigned_to_email: "dispatcher@test.invalid",
            }),
          ],
        };
      }
      return {
        tasks: [
          makeTask({
            id: "task-team-overdue",
            title: "Overdue team task",
            created_by_user_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1",
            assigned_to_user_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1",
            assigned_to_email: "dispatcher@test.invalid",
            is_overdue: true,
            due_at: "2026-05-15T10:00:00Z",
          }),
        ],
      };
    });

    vi.spyOn(dailyTasksApi, "createDailyTask").mockResolvedValue({
      task: makeTask({
        id: "task-new",
        title: "Newly created task",
        created_by_user_id: "f47ac10b-58cc-4372-a567-0e02b2c3d479",
        assigned_to_user_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1",
      }),
    });

    vi.spyOn(dailyTasksApi, "acceptDailyTask").mockImplementation(async () => {
      state.myStatus = "accepted";
      state.acceptedAt = "2026-05-16T13:00:00Z";
      return {
        task: makeTask({
          id: "task-my-1",
          title: "Call 40 drivers today",
          created_by_user_id: "f47ac10b-58cc-4372-a567-0e02b2c3d479",
          assigned_to_user_id: "f47ac10b-58cc-4372-a567-0e02b2c3d479",
          status: "accepted",
          accepted_at: state.acceptedAt,
        }),
      };
    });

    vi.spyOn(dailyTasksApi, "completeDailyTask").mockImplementation(async () => {
      state.myStatus = "completed";
      state.completedAt = "2026-05-16T14:00:00Z";
      return {
        task: makeTask({
          id: "task-my-1",
          title: "Call 40 drivers today",
          created_by_user_id: "f47ac10b-58cc-4372-a567-0e02b2c3d479",
          assigned_to_user_id: "f47ac10b-58cc-4372-a567-0e02b2c3d479",
          status: "completed",
          accepted_at: state.acceptedAt,
          completed_at: state.completedAt,
        }),
      };
    });

    vi.spyOn(dailyTasksApi, "getDailyTaskEvents").mockResolvedValue({
      events: [
        {
          id: "evt1",
          operating_company_id: "91f6d7d8-0f3a-4c2d-8e1b-2c3d4e5f6071",
          daily_task_id: "task-my-1",
          event_type: "created",
          actor_user_id: "f47ac10b-58cc-4372-a567-0e02b2c3d479",
          payload: {},
          created_at: "2026-05-16T12:00:00Z",
        },
        {
          id: "evt2",
          operating_company_id: "91f6d7d8-0f3a-4c2d-8e1b-2c3d4e5f6071",
          daily_task_id: "task-my-1",
          event_type: "accepted",
          actor_user_id: "f47ac10b-58cc-4372-a567-0e02b2c3d479",
          payload: {},
          created_at: "2026-05-16T13:00:00Z",
        },
      ],
    });

    render(wrap(<DailyTasksPage />));

    await waitFor(() => expect(screen.getByText("Daily Tasks")).toBeInTheDocument());
    await waitFor(() => expect(dailyTasksApi.listDailyTasks).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByText(/Alerts/i)).toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: /Team Tasks/i }));
    expect(await screen.findByText("Overdue team task")).toBeInTheDocument();
    expect(screen.getByText("Overdue")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /My Tasks/i }));
    expect(await screen.findByText("Call 40 drivers today")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "+ Create" }));
    await user.type(screen.getByLabelText(/Title/i), "Review fuel receipts");
    await user.type(screen.getByLabelText(/Description/i), "Close daily reconciliation.");
    await user.selectOptions(screen.getByLabelText(/Assignee/i), "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1");
    await user.click(screen.getAllByRole("button", { name: "+ Create" })[1]);
    await waitFor(() => expect(dailyTasksApi.createDailyTask).toHaveBeenCalled());

    await user.click(screen.getByRole("button", { name: "Accept" }));
    await waitFor(() => expect(dailyTasksApi.acceptDailyTask).toHaveBeenCalledWith("task-my-1"));

    await waitFor(() => expect(screen.getByRole("button", { name: "Complete" })).toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: "Complete" }));
    await waitFor(() => expect(dailyTasksApi.completeDailyTask).toHaveBeenCalledWith("task-my-1"));

    await user.click(screen.getByRole("button", { name: "Details" }));
    expect(await screen.findByText(/Activity Timeline/i)).toBeInTheDocument();
    expect(screen.getByText("created")).toBeInTheDocument();
    expect(screen.getByText("accepted")).toBeInTheDocument();
  });
});
