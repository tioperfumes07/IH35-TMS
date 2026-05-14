import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "../../components/Toast";
import * as qboApi from "../../api/qbo-integration";
import { QBOSyncStatusDashboardPage } from "./QBOSyncStatusDashboardPage";

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

function wrap(ui: ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={qc}>
      <ToastProvider>{ui}</ToastProvider>
    </QueryClientProvider>
  );
}

describe("QBOSyncStatusDashboardPage", () => {
  const now = new Date().toISOString();

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
    vi.spyOn(qboApi, "listQboSyncRuns").mockResolvedValue({
      runs: [
        { id: "r1", started_at: now, kind: "invoice_push", status: "success", retry_count: 0, last_error: null, duration_ms: 12 },
        { id: "r2", started_at: now, kind: "customer_sync", status: "pending", retry_count: 0 },
        { id: "r3", started_at: now, kind: "x", status: "failed", retry_count: 1, last_error: "boom" },
        { id: "r4", started_at: now, kind: "x", status: "dead_letter", retry_count: 9, last_error: "nope" },
      ],
    });
    vi.spyOn(qboApi, "listQboSyncAlerts").mockResolvedValue({
      alerts: [{ id: "a1", severity: "high", message: "stale", created_at: now }],
      next_cursor: null,
    });
  });

  it("renders KPI cards from loaded runs", async () => {
    render(wrap(<QBOSyncStatusDashboardPage />));
    await waitFor(() => expect(screen.getByText("Healthy (24h)")).toBeInTheDocument());
    await waitFor(() => expect(screen.getByText("Pending")).toBeInTheDocument());
    const pendingCard = screen.getByText("Pending").parentElement;
    expect(pendingCard?.textContent).toContain("1");
    const deadCard = screen.getByText("Dead letter").parentElement;
    expect(deadCard?.textContent).toContain("1");
  });

  it("row expand shows payload JSON", async () => {
    const user = userEvent.setup();
    render(wrap(<QBOSyncStatusDashboardPage />));
    await screen.findByText("invoice_push");
    const row = screen.getByText("invoice_push").closest("tr");
    expect(row).toBeTruthy();
    await user.click(row!);
    expect(await screen.findByText(/Payload \/ diagnostics/)).toBeInTheDocument();
  });

  it("retry invokes API for failed run", async () => {
    const user = userEvent.setup();
    const retrySpy = vi.spyOn(qboApi, "retryQboSyncRun").mockResolvedValue({ ok: true });
    render(wrap(<QBOSyncStatusDashboardPage />));
    const failedRow = (await screen.findByText("boom")).closest("tr");
    const retryBtn = within(failedRow as HTMLElement).getByRole("button", { name: /retry now/i });
    await user.click(retryBtn);
    await waitFor(() => expect(retrySpy).toHaveBeenCalledWith("r3", "11111111-1111-1111-1111-111111111111"));
  });

  it("acknowledge alert calls API", async () => {
    const user = userEvent.setup();
    const ackSpy = vi.spyOn(qboApi, "acknowledgeQboSyncAlert").mockResolvedValue({ ok: true, id: "a1" });
    render(wrap(<QBOSyncStatusDashboardPage />));
    await screen.findByText("stale");
    await user.click(screen.getByRole("button", { name: /acknowledge/i }));
    await waitFor(() => expect(ackSpy).toHaveBeenCalledWith("a1", "11111111-1111-1111-1111-111111111111"));
  });

  it("refetches on an interval when status filter is pending", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const listSpy = vi.spyOn(qboApi, "listQboSyncRuns").mockResolvedValue({ runs: [] });
    render(wrap(<QBOSyncStatusDashboardPage />));
    await waitFor(() => expect(listSpy).toHaveBeenCalled());
    const boxes = screen.getAllByRole("combobox");
    await user.selectOptions(boxes[0]!, "pending");
    const afterFilter = listSpy.mock.calls.length;
    await vi.advanceTimersByTimeAsync(31_000);
    await waitFor(() => expect(listSpy.mock.calls.length).toBeGreaterThan(afterFilter));
    vi.useRealTimers();
  });
});
