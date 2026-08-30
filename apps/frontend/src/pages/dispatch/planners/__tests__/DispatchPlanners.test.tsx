// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
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
  cleanup();
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={["/dispatch/planners/driver"]}>{ui}</MemoryRouter>
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

  // MOUNTED THE WAY THE APP ACTUALLY MOUNTS IT. routes/manifest.tsx registers every planner tab as
  // `<DispatchPlannersLayout><DriverPlanner /></DispatchPlannersLayout>` (:1132) — the children prop.
  // This test used to mount the layout as a react-router LAYOUT ROUTE with the planner as a nested
  // child, which only renders if the parent calls <Outlet />. DispatchPlannersLayout renders {children}
  // and contains no Outlet at all, so the nested route never rendered and the planner testids were
  // simply absent. The layout is right for production; the test was mounting a shape the app never uses.
  it("renders driver planner with shared range toolbar default 30d", async () => {
    wrap(<DispatchPlannersLayout><DriverPlanner /></DispatchPlannersLayout>);
    expect(await screen.findByTestId("dispatch-planners-layout")).toBeTruthy();
    expect(await screen.findByTestId("dispatch-driver-planner-page")).toBeTruthy();
    expect(screen.getByTestId("dispatch-planner-range-toolbar")).toBeTruthy();
    expect(screen.getByRole("button", { name: "30d" }).className).toContain("bg-slate-800");
  });

  it("switches shared range to 7d", async () => {
    wrap(<DispatchPlannersLayout><DriverPlanner /></DispatchPlannersLayout>);
    await screen.findByTestId("dispatch-driver-planner-grid");
    const bar = screen.getByTestId("dispatch-planner-range-toolbar");
    await userEvent.click(within(bar).getByRole("button", { name: "7d" }));
    expect(within(bar).getByRole("button", { name: "7d" }).className).toContain("bg-slate-800");
    expect(driverSchedulerApi.driverSchedulerOfficeApi.getGrid).toHaveBeenCalled();
  });
});
