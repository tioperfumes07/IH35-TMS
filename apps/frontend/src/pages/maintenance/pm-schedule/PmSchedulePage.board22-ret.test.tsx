import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "../../../components/Toast";
import { encodeReturnContext } from "../../../lib/returnContext";
import { PmSchedulePage } from "./PmSchedulePage";

vi.mock("../../../api/maintenance", () => ({
  listMaintenancePmSchedules: vi.fn().mockResolvedValue({ rows: [] }),
  createMaintenancePmSchedule: vi.fn(),
  generateMaintenancePmWorkOrder: vi.fn(),
}));

vi.mock("../../../contexts/CompanyContext", () => ({
  useCompanyContext: () => ({ selectedCompanyId: "co-1" }),
}));

describe("ROUND 8.20 board22 — Fleet Health Moving → PM Schedule reverse via ?ret=", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("PageHeader Back restores Maintenance Home with fh=moving when ret is present", async () => {
    const origin = "/maintenance?fh=moving";
    const ret = encodeReturnContext(origin);
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <MemoryRouter initialEntries={[`/maintenance/pm-schedule?schedule_id=sch-1&ret=${ret}`]}>
        <QueryClientProvider client={queryClient}>
          <ToastProvider>
            <Routes>
              <Route path="/maintenance/pm-schedule" element={<PmSchedulePage />} />
              <Route path="/maintenance" element={<div data-testid="maint-home-restored">home</div>} />
            </Routes>
          </ToastProvider>
        </QueryClientProvider>
      </MemoryRouter>,
    );

    expect(await screen.findByTestId("pm-schedule-page")).toBeInTheDocument();
    await userEvent.click(screen.getByTestId("page-header-back"));
    expect(await screen.findByTestId("maint-home-restored")).toBeInTheDocument();
  });
});
