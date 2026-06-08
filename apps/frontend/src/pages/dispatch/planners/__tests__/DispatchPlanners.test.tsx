import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as driverSchedulerApi from "../../../../api/driver-scheduler";
import * as dispatchApi from "../../../../api/dispatch";
import { DispatchPlannersLayout } from "../DispatchPlannersLayout";
import { DriverPlanner } from "../DriverPlanner";

vi.mock("../../../../contexts/CompanyContext", () => ({
  useCompanyContext: () => ({ selectedCompanyId: "91f6d7d8-0f3a-4c2d-8e1b-2c3d4e5f6071" }),
}));

const gridPayload: driverSchedulerApi.FleetScheduleResponse = {
  start_date: "2026-06-08",
  end_date: "2026-07-07",
  drivers: [{ driver_id: "d1", driver_name: "Jane Driver", unit_number: "101" }],
  leave_day_cells: [{ driver_id: "d1", leave_date: "2026-06-10", leave_type: "vacation" }],
  pending_requests: [],
  vacant_units: [{ unit_id: "u2", unit_number: "202" }],
};

function wrap(ui: ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={["/dispatch/planners/driver"]}>
        <Routes>
          <Route path="/dispatch/planners" element={ui}>
            <Route path="driver" element={<DriverPlanner />} />
          </Route>
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("Dispatch planners (DISP-PLANNERS)", () => {
  beforeEach(() => {
    vi.spyOn(driverSchedulerApi.driverSchedulerOfficeApi, "getGrid").mockResolvedValue(gridPayload);
    vi.spyOn(dispatchApi, "getDispatchPlannerWeek").mockResolvedValue({
      week_start: "2026-06-08",
      week_end: "2026-06-15",
      drivers: [],
      loads: [],
    });
  });

  it("renders driver planner with shared range toolbar default 30d", async () => {
    wrap(<DispatchPlannersLayout />);
    expect(await screen.findByTestId("dispatch-planners-layout")).toBeTruthy();
    expect(await screen.findByTestId("dispatch-driver-planner-page")).toBeTruthy();
    expect(screen.getByTestId("dispatch-planner-range-toolbar")).toBeTruthy();
    expect(screen.getByRole("button", { name: "30d" }).className).toContain("bg-slate-800");
  });

  it("switches shared range to 7d", async () => {
    wrap(<DispatchPlannersLayout />);
    await screen.findByTestId("dispatch-driver-planner-grid");
    await userEvent.click(screen.getByRole("button", { name: "7d" }));
    expect(screen.getByRole("button", { name: "7d" }).className).toContain("bg-slate-800");
    expect(driverSchedulerApi.driverSchedulerOfficeApi.getGrid).toHaveBeenCalled();
  });
});
