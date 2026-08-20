import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as driverSchedulerApi from "../../../api/driver-scheduler";
import * as dispatchApi from "../../../api/dispatch";
import { UnifiedTimelinePlanner } from "./UnifiedTimelinePlanner";

vi.mock("../../../contexts/CompanyContext", () => ({
  useCompanyContext: () => ({ selectedCompanyId: "91f6d7d8-0f3a-4c2d-8e1b-2c3d4e5f6071" }),
}));

vi.mock("../components/BookLoadModalV4", () => ({
  BookLoadModalV4: ({ prefillUnitId, prefillDriverId }: { prefillUnitId?: string | null; prefillDriverId?: string | null }) => (
    <div data-testid="book-load-prefill">{`${prefillUnitId}|${prefillDriverId}`}</div>
  ),
}));

// Deterministic range so the test doesn't depend on "today".
vi.mock("./PlannerRangeContext", () => ({
  usePlannerRange: () => ({
    range: { start: "2026-06-22", end: "2026-06-26" },
    days: ["2026-06-22", "2026-06-23", "2026-06-24", "2026-06-25", "2026-06-26"],
  }),
}));

function wrap(ui: ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>
  );
}

describe("UnifiedTimelinePlanner (Phase 1)", () => {
  beforeEach(() => {
    vi.spyOn(dispatchApi, "getDispatchPlannerWeek").mockResolvedValue({
      week_start: "2026-06-22",
      week_end: "2026-06-29",
      drivers: [
        { id: "d1", name: "Jane Driver", unit_number: "T-101", hos_status: "ok", blackouts: [] },
        { id: "d2", name: "On Leave Guy", unit_number: "T-102", hos_status: "ok", blackouts: [] },
        { id: "d3", name: "Free Agent", unit_number: "T-103", unit_id: "unit-103", hos_status: "ok", blackouts: [] },
      ],
      loads: [
        { id: "load-500", load_number: "L-500", driver_id: "d1", customer_id: "c-acme", customer_name: "ACME", status: "dispatched", start_at: "2026-06-23T08:00:00Z", end_at: "2026-06-24T08:00:00Z", pickup_city: "Laredo", pickup_state: "TX" },
      ],
    });
    vi.spyOn(driverSchedulerApi.driverSchedulerOfficeApi, "getGrid").mockResolvedValue({
      start_date: "2026-06-22",
      end_date: "2026-06-26",
      drivers: [],
      leave_day_cells: [{ driver_id: "d2", leave_date: "2026-06-24", leave_type: "vacation" }],
      pending_requests: [],
      vacant_units: [],
    } as driverSchedulerApi.FleetScheduleResponse);
  });

  it("renders driver rows fed from the DISPATCH feed (not the empty leave grid) with a clickable load bar", async () => {
    wrap(<UnifiedTimelinePlanner />);
    expect(await screen.findByText("Jane Driver")).toBeTruthy();
    // The load bar comes from getDispatchPlannerWeek loads[] — the fix for the empty grid.
    // The load bar's testid is keyed on the load's stable id (load-500), not its display number
    // (L-500) — matches the `data-testid={`timeline-load-${load.id}`}` convention.
    expect(await screen.findByTestId("timeline-load-load-500")).toBeTruthy();
  });

  it("shows a Status column (On-load / On-leave / Available) and a + Book on idle drivers", async () => {
    wrap(<UnifiedTimelinePlanner />);
    await screen.findByText("Jane Driver");
    expect(screen.getByText("On-load")).toBeTruthy(); // d1 has a load
    expect(screen.getByText("On-leave")).toBeTruthy(); // d2 has leave, no load
    expect(screen.getByText("Available")).toBeTruthy(); // d3 free
    // Idle/available driver gets a + Book affordance.
    expect(screen.getByTestId("timeline-book-d3")).toBeTruthy();
  });

  it("passes the planner row id as the canonical driver FK when booking its unit", async () => {
    wrap(<UnifiedTimelinePlanner />);
    fireEvent.click(await screen.findByTestId("timeline-book-d3"));
    expect(screen.getByTestId("book-load-prefill").textContent).toBe("unit-103|d3");
  });
});
