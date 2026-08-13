import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { UnitSevereRepairsReverseSection } from "./UnitSevereRepairsReverseSection";

const listSevereRepairEstimates = vi.fn().mockResolvedValue({ data: [{ id: "estimate-1", trigger_wo_id: "wo-1", description: "Engine overhaul", damage_severity: "severe", estimated_total_cents: 700000 }] });
vi.mock("../../api/maintenance", () => ({ listSevereRepairEstimates: (...args: unknown[]) => listSevereRepairEstimates(...args) }));

describe("UnitSevereRepairsReverseSection", () => {
  it("queries the exact unit FK and drills to the linked work order", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}><MemoryRouter><UnitSevereRepairsReverseSection operatingCompanyId="usmca" unitId="unit-1" /></MemoryRouter></QueryClientProvider>);
    expect(await screen.findByRole("link", { name: "Engine overhaul" })).toHaveAttribute("href", "/maintenance/work-orders/wo-1");
    expect(listSevereRepairEstimates).toHaveBeenCalledWith("usmca", { unit_id: "unit-1" });
  });
});
