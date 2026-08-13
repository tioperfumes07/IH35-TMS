import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { UnitTempCoverReverseSection } from "./UnitTempCoverReverseSection";

const listTempAssignments = vi.fn().mockResolvedValue({ assignments: [{ id: "assignment-1", primary_driver_name: "Alice Driver", cover_driver_name: "Bob Cover", start_date: "2026-08-13", end_date: "2026-08-14" }] });
vi.mock("../../api/driver-scheduler", () => ({ driverSchedulerOfficeApi: { listTempAssignments: (...args: unknown[]) => listTempAssignments(...args) } }));

describe("UnitTempCoverReverseSection", () => {
  it("queries the exact unit FK and drills to filtered scheduler", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}><MemoryRouter><UnitTempCoverReverseSection operatingCompanyId="usmca" unitId="unit-1" /></MemoryRouter></QueryClientProvider>);
    expect(await screen.findByRole("link", { name: "Open Driver Scheduler" })).toHaveAttribute("href", "/safety/driver-scheduler?unit_id=unit-1");
    expect(listTempAssignments).toHaveBeenCalledWith("usmca", { unit_id: "unit-1" });
    expect(await screen.findByText("Alice Driver")).toBeTruthy();
  });
});
