import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as dispatchApi from "../../../api/dispatch";
import { PlannerCalendarPage } from "../PlannerCalendarPage";

vi.mock("../../../contexts/CompanyContext", () => ({
  useCompanyContext: () => ({ selectedCompanyId: "91f6d7d8-0f3a-4c2d-8e1b-2c3d4e5f6071" }),
}));

vi.mock("../../../components/Toast", () => ({
  useToast: () => ({ pushToast: vi.fn() }),
}));

const weekPayload: dispatchApi.PlannerWeekPayload = {
  week_start: "2026-06-02",
  week_end: "2026-06-09",
  drivers: [
    {
      id: "d1",
      name: "Jane Driver",
      unit_number: "101",
      hos_status: "ok",
      blackouts: [{ start_at: "2026-06-03T02:00:00.000Z", end_at: "2026-06-03T10:00:00.000Z", reason: "sleeper" }],
    },
  ],
  loads: [
    {
      id: "l1",
      load_number: "LD-100",
      driver_id: "d1",
      customer_name: "Acme",
      status: "assigned_not_dispatched",
      start_at: "2026-06-03T14:00:00.000Z",
      end_at: "2026-06-04T14:00:00.000Z",
      pickup_city: "Dallas",
      pickup_state: "TX",
    },
  ],
};

function wrap(ui: ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>
  );
}

describe("PlannerCalendarPage (B21-D4)", () => {
  beforeEach(() => {
    vi.spyOn(dispatchApi, "getDispatchPlannerWeek").mockResolvedValue(weekPayload);
    vi.spyOn(dispatchApi, "patchDispatchPlannerLoadStartAt").mockResolvedValue(weekPayload.loads[0]);
  });

  it("renders planner calendar page shell", async () => {
    wrap(<PlannerCalendarPage />);
    expect(await screen.findByTestId("dispatch-planner-calendar-page")).toBeTruthy();
    expect(await screen.findByText("Planner Calendar")).toBeTruthy();
  });

  it("shows assigned load in driver week cell", async () => {
    wrap(<PlannerCalendarPage />);
    expect(await screen.findByTestId("planner-load-LD-100")).toBeTruthy();
    expect(await screen.findByText("Jane Driver")).toBeTruthy();
  });

  it("shows HOS overlay band when enabled", async () => {
    wrap(<PlannerCalendarPage />);
    expect(await screen.findByTestId("planner-hos-overlay-d1-2026-06-03")).toBeTruthy();
  });

  it("hides HOS overlay when toggled off", async () => {
    wrap(<PlannerCalendarPage />);
    await screen.findByTestId("planner-hos-overlay-d1-2026-06-03");
    await userEvent.click(screen.getByLabelText("HOS overlay"));
    expect(screen.queryByTestId("planner-hos-overlay-d1-2026-06-03")).toBeNull();
  });

  it("loads week data via dispatch planner API", async () => {
    wrap(<PlannerCalendarPage />);
    await screen.findByText("LD-100");
    expect(dispatchApi.getDispatchPlannerWeek).toHaveBeenCalledWith(
      "91f6d7d8-0f3a-4c2d-8e1b-2c3d4e5f6071",
      expect.any(String)
    );
  });
});
