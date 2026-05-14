import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactElement } from "react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../../api/client";
import * as schedApi from "../../api/scheduled-reports";
import { ToastProvider } from "../../components/Toast";
import { ScheduledReportsPage } from "./ScheduledReportsPage";

vi.mock("../../contexts/CompanyContext", () => ({
  useCompanyContext: () => ({
    selectedCompanyId: "11111111-1111-1111-1111-111111111111",
    companies: [],
    selectedCompany: null,
    isLoading: false,
    setSelectedCompany: vi.fn(),
    setDefaultCompanyForUser: vi.fn(async () => {}),
  }),
}));

vi.mock("../../auth/useAuth", () => ({
  useAuth: () => ({
    user: { email: "sched@test.com" },
    session: null,
    isLoading: false,
    isUnauthenticated: false,
    refetch: vi.fn(),
  }),
}));

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

describe("ScheduledReportsPage", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(schedApi, "listScheduledReportsV2").mockResolvedValue({
      rows: [
        {
          id: "s1",
          report_id: "ar-aging",
          name: "AR weekly",
          cadence_label: "Daily · 07:00",
          recipients: "a@b.com",
          last_run_at: "2026-05-01T12:00:00Z",
          next_run_at: "2026-05-02T12:00:00Z",
          status: "active",
        },
      ],
    });
  });

  it("lists schedules and pause calls API", async () => {
    const user = userEvent.setup();
    const pauseSpy = vi.spyOn(schedApi, "pauseScheduledReport").mockResolvedValue({ ok: true });
    render(wrap(<ScheduledReportsPage />));
    expect(await screen.findByText("AR weekly")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /^pause$/i }));
    await waitFor(() => expect(pauseSpy).toHaveBeenCalledWith("s1", "11111111-1111-1111-1111-111111111111"));
  });

  it("shows backend pending banner on 404", async () => {
    vi.spyOn(schedApi, "listScheduledReportsV2").mockRejectedValue(new ApiError(404, {}));
    render(wrap(<ScheduledReportsPage />));
    expect(await screen.findByTestId("scheduled-reports-backend-pending")).toBeInTheDocument();
  });

  it("delete removes via API", async () => {
    const user = userEvent.setup();
    const delSpy = vi.spyOn(schedApi, "deleteScheduledReport").mockResolvedValue({ ok: true });
    render(wrap(<ScheduledReportsPage />));
    await screen.findByText("AR weekly");
    await user.click(screen.getByRole("button", { name: /^delete$/i }));
    await waitFor(() => expect(delSpy).toHaveBeenCalledWith("s1", "11111111-1111-1111-1111-111111111111"));
  });
});
