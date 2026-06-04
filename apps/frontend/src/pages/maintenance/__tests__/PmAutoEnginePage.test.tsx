import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { PmAutoEnginePage } from "../PmAutoEnginePage";

const getMaintenancePmAutoEngineDashboard = vi.fn();
const updateMaintenancePmAutoEngineSettings = vi.fn();
const runMaintenancePmAutoEngineNow = vi.fn();

vi.mock("../../../api/maintenance", () => ({
  getMaintenancePmAutoEngineDashboard: (...args: unknown[]) => getMaintenancePmAutoEngineDashboard(...args),
  updateMaintenancePmAutoEngineSettings: (...args: unknown[]) => updateMaintenancePmAutoEngineSettings(...args),
  runMaintenancePmAutoEngineNow: (...args: unknown[]) => runMaintenancePmAutoEngineNow(...args),
}));

vi.mock("../../../contexts/CompanyContext", () => ({
  useCompanyContext: () => ({
    selectedCompanyId: "11111111-1111-4111-8111-111111111111",
    companies: [{ id: "11111111-1111-4111-8111-111111111111", name: "IH35" }],
  }),
}));

vi.mock("../../../components/Toast", () => ({
  useToast: () => ({ pushToast: vi.fn() }),
}));

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <PmAutoEnginePage />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("PmAutoEnginePage (B28)", () => {
  beforeEach(() => {
    getMaintenancePmAutoEngineDashboard.mockReset();
    updateMaintenancePmAutoEngineSettings.mockReset();
    runMaintenancePmAutoEngineNow.mockReset();
    getMaintenancePmAutoEngineDashboard.mockResolvedValue({
      runs: [{ id: "run-1", started_at: "2026-06-04T10:00:00Z", status: "completed", schedules_evaluated: 3, work_orders_created: 1, alerts_created: 0 }],
      recent_log: [{ id: "log-1", action: "wo_created", schedule_label: "Oil change", unit_number: "T-101" }],
      settings: { is_paused: false },
      lookahead_miles: 500,
    });
    updateMaintenancePmAutoEngineSettings.mockResolvedValue({ is_paused: true });
    runMaintenancePmAutoEngineNow.mockResolvedValue({ schedules_evaluated: 2, work_orders_created: 0, alerts_created: 1 });
  });

  it("renders PM auto engine dashboard shell", async () => {
    renderPage();
    expect(await screen.findByTestId("maint-pm-auto-engine")).toBeInTheDocument();
    expect(screen.getByText("PM Auto Engine")).toBeInTheDocument();
    expect(await screen.findByText("completed")).toBeInTheDocument();
  });

  it("shows recent action log entries", async () => {
    renderPage();
    expect(await screen.findByText(/wo_created/)).toBeInTheDocument();
    expect(screen.getByText(/Oil change/)).toBeInTheDocument();
  });

  it("pause control calls settings API", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("Pause engine");
    await user.click(screen.getByRole("button", { name: "Pause engine" }));
    expect(updateMaintenancePmAutoEngineSettings).toHaveBeenCalledWith({
      operating_company_id: "11111111-1111-4111-8111-111111111111",
      is_paused: true,
    });
  });
});
