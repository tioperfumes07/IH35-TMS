import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { InShopV3Board, inShopState } from "./InShopV3Board";
import { inShopTruckShape } from "./InShopTruck";
import { getShopBays } from "../../../api/shopBays";

vi.mock("../../../api/shopBays", () => ({ getShopBays: vi.fn() }));
const wo = (n: number, status: string, unit: string, make: string, model: string) => ({ work_order_id: `w${n}`, display_id: `WO-${n}`, status, unit_id: `u${n}`, unit_number: unit, unit_make: make, unit_model: model, title: `Job ${n}`, bay_number: n, bay_assigned_at: null, in_shop_at: null, expected_release_at: null });

describe("Board 23 — Maintenance In Shop (Maintenance-InShop.dc.html)", () => {
  it("one card per bay: BAY n · unit, the board's state words and dots, the truck, the job, an open bay", async () => {
    vi.mocked(getShopBays).mockResolvedValue({ operating_company_id: "c", bay_count: 4, yard: [], bays: [
      { bay_number: 1, work_order: wo(1, "in_progress", "T124", "Peterbilt", "579") },
      { bay_number: 2, work_order: wo(2, "waiting_parts", "T166", "Peterbilt", "389") },
      { bay_number: 3, work_order: wo(3, "complete", "T157", "Volvo", "VNL") },
      { bay_number: 4, work_order: null } ] });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}><MemoryRouter><InShopV3Board companyId="c" /></MemoryRouter></QueryClientProvider>);
    expect(await screen.findByTestId("in-shop-v3-board")).toHaveAttribute("data-v3-board", "Maintenance-InShop");
    for (const t of ["Working", "Waiting parts", "Ready", "Open", "Open bay", "Drag a truck in from the yard lane", "Measured"]) expect(screen.getByText(t)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "T124" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "classic truck" })).toBeInTheDocument();
    expect(screen.getByLabelText("Bay 2 Waiting parts 40%")).toBeInTheDocument();
  });
  it("state and cab rules", () => {
    expect(inShopState("waiting_parts")).toMatchObject({ label: "Waiting parts", dot: "#B45309", cab: "#A15C0B", pct: 40 });
    expect(inShopState("in_progress").pct).toBe(60);
    expect([inShopTruckShape("Peterbilt", "579"), inShopTruckShape("Peterbilt", "389"), inShopTruckShape("Mack", "Anthem")]).toEqual(["aero", "classic", "cabover"]);
  });
});
