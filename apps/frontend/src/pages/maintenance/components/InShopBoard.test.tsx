import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { getShopBays } from "../../../api/shopBays";
import { InShopBoard, bayStatusLabel } from "./InShopBoard";

// LEAD 443.301 · register row 59 — the In Shop board is bay cards + yard lane (approved V3 board).
vi.mock("../../../components/Toast", () => ({ useToast: () => ({ pushToast: vi.fn() }) }));
vi.mock("../../../api/shopBays", () => ({
  getShopBays: vi.fn(async () => ({
    operating_company_id: "c1", bay_count: 4,
    bays: [
      { bay_number: 1, work_order: { work_order_id: "w1", display_id: "WO-1", status: "in_progress", unit_id: "u1", unit_number: "T124", title: "PM-A + engine fault codes", bay_number: 1, bay_assigned_at: "2026-10-24T01:00:00Z", in_shop_at: null, expected_release_at: null } },
      { bay_number: 2, work_order: { work_order_id: "w2", display_id: "WO-2", status: "waiting_parts", unit_id: "u2", unit_number: "T166", title: "Brake chambers", bay_number: 2, bay_assigned_at: "2026-10-24T01:00:00Z", in_shop_at: null, expected_release_at: null } },
      { bay_number: 3, work_order: { work_order_id: "w3", display_id: "WO-3", status: "complete", unit_id: "u3", unit_number: "T157", title: "Tire rotation", bay_number: 3, bay_assigned_at: "2026-10-24T01:00:00Z", in_shop_at: null, expected_release_at: null } },
      { bay_number: 4, work_order: null },
    ],
    yard: [{ work_order_id: "w9", display_id: "WO-9", status: "open", unit_id: "u9", unit_number: "T170", title: "DVIR defect", bay_number: null, bay_assigned_at: null, in_shop_at: null, expected_release_at: null }],
  })),
  assignWorkOrderBay: vi.fn(), releaseWorkOrderBay: vi.fn(),
}));

const wrap = (ui: React.ReactElement) =>
  render(<QueryClientProvider client={new QueryClient()}><MemoryRouter>{ui}</MemoryRouter></QueryClientProvider>);

describe("InShopBoard (row 59)", () => {
  it("renders one card per bay with the truck, status and work; the empty bay is open", async () => {
    wrap(<InShopBoard companyId="c1" />);
    expect(await screen.findByTestId("in-shop-bay-4")).toHaveTextContent("Open bay");
    expect(screen.getByTestId("in-shop-bay-1")).toHaveTextContent("T124");
    expect(screen.getByTestId("in-shop-bay-1")).toHaveTextContent("Working");
    expect(screen.getByTestId("in-shop-bay-2")).toHaveTextContent("Waiting parts");
    expect(screen.getByTestId("in-shop-bay-3")).toHaveTextContent("Ready");
    expect(screen.getAllByText("Release bay")).toHaveLength(3);
  });
  it("lists the yard lane with a Move-to-bay choice limited to open bays", async () => {
    wrap(<InShopBoard companyId="c1" />);
    const lane = await screen.findByTestId("in-shop-yard-lane");
    expect(lane).toHaveTextContent("T170");
    expect(screen.getByRole("option", { name: "Bay 4" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "Bay 1" })).toBeNull();
  });
  it("maps statuses to board words", () => {
    expect(bayStatusLabel("complete").label).toBe("Ready");
    expect(bayStatusLabel("in_progress").label).toBe("Working");
  });
  // Kept from the pre-bay test (it guarded "no sample bays" while no bay data existed): the board still links the
  // real truck + work order, never turns a failed read into an empty board, and invents no progress.
  it("links the actual unit and work order, and shows no invented progress", async () => {
    wrap(<InShopBoard companyId="c1" />);
    expect(await screen.findByRole("link", { name: "T124" })).toHaveAttribute("href", "/fleet/units/u1");
    expect(screen.getByRole("link", { name: "WO-1" })).toHaveAttribute("href", "/maintenance/work-orders/w1");
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "View all work orders →" })).toHaveAttribute("href", "/maintenance/active-wos");
    expect(getShopBays).toHaveBeenCalledWith("c1");
  });
  it("does not turn a failed read into an empty board", async () => {
    vi.mocked(getShopBays).mockRejectedValueOnce(new Error("offline"));
    render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter><InShopBoard companyId="c1" /></MemoryRouter></QueryClientProvider>);
    expect(await screen.findByText("Couldn't load the shop bays")).toBeInTheDocument();
    expect(screen.queryByText("Open bay")).not.toBeInTheDocument();
  });
});
