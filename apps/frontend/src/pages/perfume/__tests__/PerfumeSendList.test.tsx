import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as clientApi from "../../../api/client";
import { ToastProvider } from "../../../components/Toast";
import { PerfumeSendListPanel } from "../PerfumeSendListPanel";

vi.mock("../../../api/client", async (importOriginal) => ({ ...(await importOriginal<typeof import("../../../api/client")>()), apiRequest: vi.fn() }));

// Owner 2026-11-26 23:23 CT: pick what the list shows; restricted brands out of every list.
const calls: Array<[string, unknown]> = [];
beforeEach(() => {
  calls.length = 0;
  vi.mocked(clientApi.apiRequest).mockImplementation(async (path: string, opts?: { method?: string; body?: unknown }) => {
    if (opts?.method) calls.push([path, opts.body]);
    if (path === "/api/v1/perfume/send-list/restricted") return { brands: ["CHANEL"], items: [] };
    if (path === "/api/v1/perfume/inventory/sites") return { sites: [{ code: "008", name: "Perfume Bodega Laredo", kind: "warehouse", own: true, active: true, address: null, sort_order: 1, units: 0, items: 0, fifo_value_cents: 0 }] };
    if (path === "/api/v1/perfume/price-levels") return { levels: [{ id: "l1", name: "Retail", channel: "retail", method: "margin", pct: 28, cost_basis: "avg", floor_pct: null, active: true, sort_order: 10, fixed_prices: 0, customers: 0 }] };
    if (path === "/api/v1/perfume/campaigns") return { campaigns: [] };
    if (path === "/api/v1/perfume/send-list/preview") return { rows: [{ item_id: "i1", description: "DIOR SAUVAGE EDT 100ML (M)", brand: "DIOR", category: "Men", size: 100, conc: "EDT", upc: "3348901250146", tio_code: "", hk_code: "108", qty: 12, my_price: 7800, level_price: null }],
      total: 1, level: null, our_items: 3876, brands: ["CHANEL", "DIOR"], left_out: { restricted: 40, brand: 0, no_stock: 1200, category: 0 } };
    throw new Error(`unexpected ${path}`);
  });
});
const mount = () => render(<MemoryRouter><QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><ToastProvider><PerfumeSendListPanel /></ToastProvider></QueryClientProvider></MemoryRouter>);

describe("send list", () => {
  it("previews our items, a column ticked off leaves the request, a restricted brand is added", async () => {
    mount();
    const k = await screen.findByTestId("perfume-sendlist-kpis");
    await waitFor(() => expect(within(k).getByText("3,876")).toBeTruthy());
    expect(await screen.findByText("DIOR SAUVAGE EDT 100ML (M)")).toBeTruthy();
    fireEvent.click(screen.getByTestId("perfume-send-col-upc"));
    await waitFor(() => expect(calls.some(([p, b]) => p === "/api/v1/perfume/send-list/preview" && !(b as { columns: string[] }).columns.includes("upc"))).toBe(true));
    fireEvent.change(screen.getByTestId("perfume-send-restricted-input"), { target: { value: "VERSACE" } });
    fireEvent.click(screen.getByTestId("perfume-send-restricted-add"));
    await waitFor(() => expect(calls).toContainEqual(["/api/v1/perfume/send-list/restricted", { brands: ["CHANEL", "VERSACE"], item_ids: [] }]));
  });
});
