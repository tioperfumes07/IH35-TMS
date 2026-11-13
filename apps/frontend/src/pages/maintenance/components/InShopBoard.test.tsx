import { render, screen, within } from "@testing-library/react";
import { openCombo } from "../../../test-utils/pickCombo";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { getShopBays } from "../../../api/shopBays";
import { InShopBoard, bayProgressPct, bayStatusLabel } from "./InShopBoard";

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
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={["/maintenance/fleet-table?status=in-shop"]}>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );

describe("InShopBoard (row 59)", () => {
  it("renders one card per bay with the truck, status and work; the empty bay is open", async () => {
    wrap(<InShopBoard companyId="c1" />);
    expect(await screen.findByTestId("in-shop-bay-4")).toHaveTextContent("OPEN BAY");
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
    // The Move-to-bay choice is a SelectCombobox: its options exist only while the list is open.
    openCombo(within(lane).getByRole("combobox"));
    expect(screen.getByRole("option", { name: "Bay 4" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "Bay 1" })).toBeNull();
  });
  it("maps statuses to board words", () => {
    expect(bayStatusLabel("complete").label).toBe("Ready");
    expect(bayStatusLabel("in_progress").label).toBe("Working");
  });
  // ROUND 8.20 board23 — occupied bays show status-derived progress; empty bay has none; chrome links carry ret.
  it("links the actual unit and work order, status progress on occupied bays, ret on chrome", async () => {
    wrap(<InShopBoard companyId="c1" />);
    const unitHref = (await screen.findByRole("link", { name: "T124" })).getAttribute("href") ?? "";
    expect(unitHref).toContain("/fleet/units/u1");
    const woHref = screen.getByRole("link", { name: "WO-1" }).getAttribute("href") ?? "";
    expect(woHref).toContain("/maintenance/work-orders/w1");
    expect(screen.getAllByRole("progressbar")).toHaveLength(3);
    expect(screen.getByTestId("in-shop-bay-1-progress")).toHaveTextContent("65%");
    expect(screen.queryByTestId("in-shop-bay-4-progress")).not.toBeInTheDocument();
    const viewAll = screen.getByRole("link", { name: "View all work orders →" });
    expect(viewAll.getAttribute("href") ?? "").toContain("ret=");
    expect(screen.getByTestId("in-shop-check-truck-in").getAttribute("href") ?? "").toContain("ret=");
    expect(getShopBays).toHaveBeenCalledWith("c1");
  });
  it("maps WO status to progress pct without inventing empty-bay progress", () => {
    expect(bayProgressPct(null)).toBeNull();
    expect(bayProgressPct("in_progress")).toBe(65);
    expect(bayProgressPct("complete")).toBe(100);
  });
  it("does not turn a failed read into an empty board", async () => {
    vi.mocked(getShopBays).mockRejectedValueOnce(new Error("offline"));
    render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter><InShopBoard companyId="c1" /></MemoryRouter></QueryClientProvider>);
    expect(await screen.findByText("Couldn't load the shop bays")).toBeInTheDocument();
    expect(screen.queryByText("OPEN BAY")).not.toBeInTheDocument();
  });
});
