import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { listDispatchInShopUnits } from "../../../api/dispatch";
import { InShopBoard } from "./InShopBoard";

vi.mock("../../../api/dispatch", () => ({ listDispatchInShopUnits: vi.fn() }));
vi.mock("./FleetHealthLine", () => ({ FleetTruck: () => <svg aria-hidden="true" /> }));
function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}><MemoryRouter><InShopBoard companyId="company-fixture" /></MemoryRouter></QueryClientProvider>);
}
describe("InShop board uses canonical work orders, never sample bays", () => {
  beforeEach(() => { vi.mocked(listDispatchInShopUnits).mockReset(); });
  it("scopes the read and links the actual unit and work order", async () => {
    vi.mocked(listDispatchInShopUnits).mockResolvedValue({ rows: [{ unit_id: "unit-fixture", unit_number: "Unit fixture", work_order_id: "wo-fixture", work_order_display_id: "WO fixture", opened_at: "2026-10-23T14:00:00Z", expected_ready_at: null, shop_or_vendor: "Internal shop", days_down: 0, status: "awaiting_parts" }] });
    mount();
    expect(await screen.findByText("Waiting parts")).toBeInTheDocument();
    expect(listDispatchInShopUnits).toHaveBeenCalledWith("company-fixture");
    expect(screen.getByRole("link", { name: "Unit fixture" })).toHaveAttribute("href", "/fleet/units/unit-fixture");
    expect(screen.getByRole("link", { name: "WO fixture" })).toHaveAttribute("href", "/maintenance/work-orders/wo-fixture");
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
    expect(screen.queryByText("BAY 1")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "View all work orders →" })).toHaveAttribute("href", "/maintenance/active-wos");
    expect(screen.queryByText("View work orders (1) →")).not.toBeInTheDocument();
  });
  it("shows a real empty cohort without inventing open bays", async () => {
    vi.mocked(listDispatchInShopUnits).mockResolvedValue({ rows: [] });
    mount();
    expect(await screen.findByText("No open in-shop work orders for this company.")).toBeInTheDocument();
    expect(screen.queryAllByRole("article")).toHaveLength(0);
  });
  it("does not turn a failed read into an empty cohort", async () => {
    vi.mocked(listDispatchInShopUnits).mockRejectedValue(new Error("offline"));
    mount();
    expect(await screen.findByText("Couldn't load in-shop work orders")).toBeInTheDocument();
    expect(screen.queryByText("No open in-shop work orders for this company.")).not.toBeInTheDocument();
  });
  it("refuses an orphan row instead of dropping it silently", async () => {
    vi.mocked(listDispatchInShopUnits).mockResolvedValue({ rows: [{ unit_id: "unit-fixture", unit_number: "Unit fixture", work_order_id: "", work_order_display_id: "", opened_at: "", expected_ready_at: null, shop_or_vendor: "", days_down: 0, status: "open" }] });
    mount();
    expect(await screen.findByText("Couldn't load in-shop work orders")).toBeInTheDocument();
  });
});
