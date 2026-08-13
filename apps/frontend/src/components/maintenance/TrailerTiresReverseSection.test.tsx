import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TrailerTiresReverseSection } from "./TrailerTiresReverseSection";

const listMaintenanceTireRecords = vi.fn();
vi.mock("../../api/maintenance", () => ({
  listMaintenanceTireRecords: (...args: unknown[]) => listMaintenanceTireRecords(...args),
}));

describe("TrailerTiresReverseSection", () => {
  beforeEach(() => {
    listMaintenanceTireRecords.mockReset();
    listMaintenanceTireRecords.mockResolvedValue({ rows: [{ id: "tire-1", position_code: "TRAILER-L1", position_label: "Trailer Left 1", brand_name: "Michelin", tread_depth_32nds: 18 }] });
  });

  it("queries the exact equipment FK and drills to the canonical tire program", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}><MemoryRouter><TrailerTiresReverseSection operatingCompanyId="usmca" equipmentId="trailer-1" /></MemoryRouter></QueryClientProvider>);
    const links = await screen.findAllByRole("link", { name: /Open tire program|Trailer Left 1/ });
    expect(links.every((link) => link.getAttribute("href") === "/maintenance/tires?equipment_id=trailer-1")).toBe(true);
    expect(listMaintenanceTireRecords).toHaveBeenCalledWith("usmca", { equipment_id: "trailer-1" });
  });
});
