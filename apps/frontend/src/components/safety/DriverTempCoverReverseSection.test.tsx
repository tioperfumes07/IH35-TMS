import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { DriverTempCoverReverseSection } from "./DriverTempCoverReverseSection";
import { expectDrillHref } from "../../test-utils/expectDrillHref";

const listTempAssignments = vi.fn().mockResolvedValue({ assignments: [{ id: "assignment-1", primary_driver_id: "driver-1", cover_driver_id: "driver-2", unit_id: "unit-101", unit_number: "101", start_date: "2026-08-13", end_date: "2026-08-14" }] });
const listDriverRequests = vi.fn().mockResolvedValue({ requests: [{ id: "request-1", request_number: "DLS-2026-000001", leave_type: "sick", status: "pending_review", start_date: "2026-09-15", end_date: "2026-09-15" }], total_count: 1 });
vi.mock("../../api/driver-scheduler", () => ({ driverSchedulerOfficeApi: {
  listTempAssignments: (...args: unknown[]) => listTempAssignments(...args),
  listDriverRequests: (...args: unknown[]) => listDriverRequests(...args),
} }));

describe("DriverTempCoverReverseSection", () => {
  it("queries either driver role by exact FK and drills to filtered scheduler", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}><MemoryRouter><DriverTempCoverReverseSection operatingCompanyId="usmca" driverId="driver-1" /></MemoryRouter></QueryClientProvider>);
    expectDrillHref(await screen.findByRole("link", { name: "Open Driver Scheduler" }), "/safety/driver-scheduler?driver_id=driver-1");
    expect(listTempAssignments).toHaveBeenCalledWith("usmca", { driver_id: "driver-1" });
    expect(listDriverRequests).toHaveBeenCalledWith("usmca", "driver-1");
    expectDrillHref(await screen.findByRole("link", { name: "DLS-2026-000001" }), "/safety/scheduler/requests/request-1");
    expect(await screen.findByText("Primary driver")).toBeTruthy();
    expectDrillHref(await screen.findByRole("link", { name: "101" }), "/fleet/units/unit-101");
  });
});
