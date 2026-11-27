import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as clientApi from "../../../api/client";
import { ToastProvider } from "../../../components/Toast";
import { PerfumeValuationPanel, PerfumeWriteoffsPanel } from "../PerfumeInventoryPanel";

vi.mock("../../../api/client", async (importOriginal) => ({ ...(await importOriginal<typeof import("../../../api/client")>()), apiRequest: vi.fn() }));

// Owner 2026-11-26 20:28 / 21:24 CT: write-offs over $500 by a second person; FIFO and average both; quarantine never sold.
const site = (code: string, name: string, kind: string | null) => ({ code, name, kind, own: true, active: true, address: null, sort_order: 10, units: 12, items: 2, fifo_value_cents: 15000 });
const calls: Array<[string, unknown]> = [];
beforeEach(() => {
  calls.length = 0;
  vi.mocked(clientApi.apiRequest).mockImplementation(async (path: string, opts?: { method?: string; body?: unknown }) => {
    if (opts?.method) calls.push([path, opts.body]);
    if (path === "/api/v1/perfume/inventory/sites") return { sites: [site("008", "Perfume Bodega Laredo", "warehouse"), site("QZ", "Quarantine shelf", "quarantine")] };
    if (path === "/api/v1/perfume/inventory/writeoffs" && !opts?.method) return { writeoffs: [{ id: "w1", number: "WO-000001", location_code: "008", reason: "damaged", notes: "dropped", status: "submitted",
      value_cents: 54000, created_at: "", submitted_at: "", approved_at: null, submitted_by_email: "jorge@test", approved_by_email: null, lines: 1, units: 12 }] };
    if (path === "/api/v1/perfume/inventory/writeoffs") return { id: "w2", number: "WO-000002" };
    if (path === "/api/v1/perfume/inventory/writeoffs/w1") return { id: "w1", number: "WO-000001", location_code: "008", reason: "damaged", notes: "dropped", status: "submitted", value_cents: 54000,
      created_at: "", submitted_at: "", approved_at: null, submitted_by_email: null, approved_by_email: null, needs_second_person: true,
      lines: [{ id: "l1", item_id: "i1", display_name: "ZZ · NIGHT", qty: 12, lot_id: null, lot_code: null, on_hand: 20 }], moves: [] };
    if (path === "/api/v1/perfume/inventory/writeoffs/w1/post") return { cost_cents: 54000 };
    if (path.startsWith("/api/v1/perfume/inventory/valuation")) return { as_of: "2026-11-30",
      rows: [{ location_code: "008", item_id: "i1", display_name: "ZZ · NIGHT", qty: 8, fifo_cents: 56000, avg_cents: 44000 }],
      sites: [{ location_code: "008", units: 8, fifo_cents: 56000, avg_cents: 44000 }], total_fifo_cents: 56000, total_avg_cents: 44000 };
    throw new Error(`unexpected ${path}`);
  });
});
const mount = (ui: React.ReactNode) => render(<MemoryRouter><QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><ToastProvider>{ui}</ToastProvider></QueryClientProvider></MemoryRouter>);

describe("write-offs and valuation", () => {
  it("a write-off over $500 says a second person posts it; starting one needs a site", async () => {
    mount(<PerfumeWriteoffsPanel />);
    fireEvent.click(await screen.findByTestId("perfume-wo-start"));
    expect(calls.length).toBe(0); // no site → nothing sent
    fireEvent.click((await screen.findAllByText("WO-000001"))[0]!);
    const ed = await screen.findByTestId("perfume-wo-editor");
    await waitFor(() => expect(ed.textContent).toContain("$540.00"));
    expect(ed.textContent).toContain("a second person posts it");
    fireEvent.click(within(ed).getByTestId("perfume-wo-post"));
    await waitFor(() => expect(calls).toContainEqual(["/api/v1/perfume/inventory/writeoffs/w1/post", {}]));
  });
  it("valuation shows FIFO and average side by side", async () => {
    mount(<PerfumeValuationPanel />);
    const k = await screen.findByTestId("perfume-valuation-kpis");
    await waitFor(() => expect(within(k).getByText("$560.00")).toBeTruthy());
    expect(within(k).getByText("$440.00")).toBeTruthy();
  });
});
