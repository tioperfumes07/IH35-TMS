import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as clientApi from "../../../api/client";
import { ToastProvider } from "../../../components/Toast";
import { PerfumeCountsPanel, PerfumeSitesPanel, PerfumeStockPanel } from "../PerfumeInventoryPanel";

vi.mock("../../../api/client", async (importOriginal) => ({ ...(await importOriginal<typeof import("../../../api/client")>()), apiRequest: vi.fn() }));

// Owner 2026-11-26 20:21 / 20:28 CT: multiple warehouses and stores, FIFO and average cost both, over $500 a second person.
const site = (code: string, name: string, kind: string | null) => ({ code, name, kind, own: true, active: true, address: null, sort_order: 10, units: 12, items: 2, fifo_value_cents: 15000 });
const calls: Array<[string, unknown]> = [];
beforeEach(() => {
  calls.length = 0;
  vi.mocked(clientApi.apiRequest).mockImplementation(async (path: string, opts?: { method?: string; body?: unknown }) => {
    if (opts?.method) calls.push([path, opts.body]);
    if (path === "/api/v1/perfume/inventory/sites") return { sites: [site("008", "Perfume Bodega Laredo", "warehouse"), site("011", "Laredo", null), { ...site("TRANSIT", "In transit", "transit"), units: 0 }] };
    if (path.startsWith("/api/v1/perfume/inventory/stock")) return { stock: [
      { item_id: "i1", display_name: "ZZ · NIGHT · 100 ml", internal_code: "T-1", location_code: "008", location_name: "Perfume Bodega Laredo", qty: 8, avg_cost_cents: 1150, fifo_value_cents: 10400, oldest_lot: "2026-11-20", min_qty: 10, max_qty: null },
      { item_id: "i2", display_name: "ZZ · DAY · 100 ml", internal_code: null, location_code: "011", location_name: "Laredo", qty: 4, avg_cost_cents: 2000, fifo_value_cents: 8000, oldest_lot: "2026-11-21", min_qty: null, max_qty: null }] };
    if (path === "/api/v1/perfume/inventory/opening" && !opts?.method) return { lists: ["inventory 11-20.xlsx (2026-11-20)"], lines: 30120, units: 61234, value_cents: 123456700, skipped_no_cost: 12, skipped_unknown_site: 10,
      by_site: [{ code: "008", units: 5000, value: 1000000, lines: 3000 }], already_applied: false };
    if (path === "/api/v1/perfume/inventory/opening") return { lines: 30120, units: 61234, value_cents: 123456700 };
    if (path.startsWith("/api/v1/perfume/inventory/sites/")) return { ok: true };
    if (path === "/api/v1/perfume/inventory/counts" && !opts?.method) return { counts: [{ id: "k1", number: "CC-000001", location_code: "008", status: "submitted", diff_value_cents: -60000, created_at: "2026-11-27T02:00:00Z",
      submitted_at: "2026-11-27T02:10:00Z", approved_at: null, submitted_by_email: "jorge@test", approved_by_email: null, lines: 1 }] };
    if (path === "/api/v1/perfume/inventory/counts/k1") return { id: "k1", number: "CC-000001", location_code: "008", status: "submitted", diff_value_cents: -60000, notes: null, created_at: "", submitted_at: null,
      approved_at: null, submitted_by_email: null, approved_by_email: null, needs_second_person: true,
      totals: { lines: 1, counted: 1, not_counted: 0, gain_cents: 0, loss_cents: -60000, net_cents: -60000 },
      lines: [{ id: "cl1", item_id: "i1", display_name: "ZZ · NIGHT · 100 ml", tio_code: "TIO-1", brand: "ZZ", upc: null, bin: null, expected_qty: 100, counted_qty: 40, counted_at: "2026-11-27T02:05:00Z", counted_by_email: "jorge@test", variance: -60, on_hand_now: 100, unit_cost_cents: 1000 }] };
    if (path === "/api/v1/perfume/inventory/counts/k1/post") return { lines_moved: 1 };
    throw new Error(`unexpected ${path}`);
  });
});
const mount = (ui: React.ReactNode) => render(<MemoryRouter><QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><ToastProvider>{ui}</ToastProvider></QueryClientProvider></MemoryRouter>);

describe("inventory screens", () => {
  it("stock on hand: units, FIFO and average values, and the below-reorder KPI", async () => {
    mount(<PerfumeStockPanel />);
    const k = await screen.findByTestId("perfume-stock-kpis");
    await waitFor(() => expect(within(k).getByText("12")).toBeTruthy());
    expect(within(k).getByText("$184.00")).toBeTruthy(); // FIFO 104 + 80
    expect(within(k).getByText("$172.00")).toBeTruthy(); // average 8 × 11.50 + 4 × 20
    expect(within(k).getByText("1")).toBeTruthy(); // NIGHT is under its reorder point
    // In transit is never offered as a site to pick.
    expect(within(screen.getByTestId("perfume-stock-site")).queryByText(/In transit/)).toBeNull();
  });
  it("sites: set a site's kind; opening stock shows what the file brings and needs a date", async () => {
    mount(<PerfumeSitesPanel />);
    fireEvent.change(await screen.findByTestId("perfume-site-kind-011"), { target: { value: "store" } });
    await waitFor(() => expect(calls).toContainEqual(["/api/v1/perfume/inventory/sites/011", { kind: "store" }]));
    const o = await screen.findByTestId("perfume-opening");
    await waitFor(() => expect(o.textContent).toContain("61,234 units"));
    fireEvent.click(within(o).getByTestId("perfume-opening-apply"));
    expect(calls.some(([p]) => p === "/api/v1/perfume/inventory/opening")).toBe(false); // no date → nothing sent
  });
  it("a count over $500 says a second person posts it", async () => {
    mount(<PerfumeCountsPanel />);
    fireEvent.click((await screen.findAllByText("CC-000001"))[0]!);
    const ed = await screen.findByTestId("perfume-count-editor");
    await waitFor(() => expect(ed.textContent).toContain("a second person posts it"));
    fireEvent.click(within(ed).getByTestId("perfume-count-post"));
    await waitFor(() => expect(calls.map((c) => c[0])).toContain("/api/v1/perfume/inventory/counts/k1/post"));
  });
});
