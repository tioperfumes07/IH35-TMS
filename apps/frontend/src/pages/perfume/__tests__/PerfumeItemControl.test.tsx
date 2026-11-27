import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as clientApi from "../../../api/client";
import { ToastProvider } from "../../../components/Toast";
import { ItemCreator, ItemFileEditor } from "../PerfumeItemFilePanel";

vi.mock("../../../api/client", async (importOriginal) => ({ ...(await importOriginal<typeof import("../../../api/client")>()), apiRequest: vi.fn() }));

// LEAD ROUND L.20 (owner 2026-11-27 13:50 CT, CONTROL Item File Maintenance): POS code, ticket description, sold by pack + units,
// preferred vendor, stock / active, special and minimum price, change price — in the item editor and the item creator.
const calls: Array<[string, unknown]> = [];
beforeEach(() => {
  calls.length = 0;
  vi.mocked(clientApi.apiRequest).mockImplementation(async (path: string, opts?: { method?: string; body?: unknown }) => {
    if (opts?.method) calls.push([path, opts.body]);
    if (path === "/api/v1/perfume/vendors") return { vendors: [{ id: "v1", name: "Perfume Center of America", short_name: "PCA", kind: "buy" }, { id: "v2", name: "My inventory", short_name: null, kind: "inventory" }] };
    if (path === "/api/v1/perfume/item-file/i1" && opts?.method === "PATCH") return { ok: true };
    if (path === "/api/v1/perfume/item-file/i1") return { item: { id: "i1", internal_code: null, brand: "ZZ", name: "ONE", size_ml: "100", conc: "EDP", gender: "M", flags: [], display_name: "ZZ · ONE · 100 ml",
      pos_code: null, ticket_description: null, sold_by: "piece", units_per_pack: null, preferred_vendor_id: null, is_stock_item: true, is_active: true, special_price_cents: null, min_price_cents: 1500, price_locked: false },
      upcs: [], vendor_lines: [], remembered: [], quotes: [], orders: [], purchase_orders: [], best_cost_cents: null, hk_codes: [], costs: { my_avg_cost_cents: null, my_last_cost_cents: null }, events: [] };
    if (path === "/api/v1/perfume/item-file" && opts?.method === "POST") return { id: "new1", display_name: "ZZ · PACK · 100 ml" };
    if (path === "/api/v1/perfume/item-file-options") return { brands: [], models: [], sizes: [] };
    if (path.startsWith("/api/v1/perfume/catalogs")) return { kinds: [] };
    if (path.startsWith("/api/v1/perfume/families")) return { families: [] };
    return {};
  });
});
const mount = (ui: React.ReactNode) => render(<MemoryRouter><QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><ToastProvider>{ui}</ToastProvider></QueryClientProvider></MemoryRouter>);

describe("CONTROL item fields", () => {
  it("the editor shows the item's values and saves POS code, ticket, pack of 12, vendor, prices and the lock in one PATCH", async () => {
    mount(<ItemFileEditor id="i1" onChanged={() => {}} />);
    const box = await screen.findByTestId("perfume-itemfile-control");
    expect((within(box).getByTestId("perfume-itemfile-min-price") as HTMLInputElement).value).toBe("15.00");
    expect((within(box).getByTestId("perfume-itemfile-units-per-pack") as HTMLInputElement).disabled).toBe(true);
    await waitFor(() => expect(within(box).getByText("PCA")).toBeTruthy());
    fireEvent.change(within(box).getByTestId("perfume-itemfile-pos-code"), { target: { value: "ZZ-01" } });
    fireEvent.change(within(box).getByTestId("perfume-itemfile-ticket"), { target: { value: "ZZ ONE 100" } });
    fireEvent.change(within(box).getByTestId("perfume-itemfile-sold-by"), { target: { value: "pack" } });
    fireEvent.change(within(box).getByTestId("perfume-itemfile-units-per-pack"), { target: { value: "12" } });
    fireEvent.change(within(box).getByTestId("perfume-itemfile-pref-vendor"), { target: { value: "v1" } });
    fireEvent.change(within(box).getByTestId("perfume-itemfile-min-price"), { target: { value: "18.50" } });
    fireEvent.change(within(box).getByTestId("perfume-itemfile-active"), { target: { value: "N" } });
    fireEvent.change(within(box).getByTestId("perfume-itemfile-change-price"), { target: { value: "N" } });
    fireEvent.click(screen.getByTestId("perfume-itemfile-save"));
    await waitFor(() => expect(calls).toContainEqual(["/api/v1/perfume/item-file/i1", {
      pos_code: "ZZ-01", ticket_description: "ZZ ONE 100", sold_by: "pack", units_per_pack: 12, preferred_vendor_id: "v1", min_price_cents: 1850, is_active: false, price_locked: true }]));
  });
  it("the creator sends the CONTROL fields with the new item", async () => {
    mount(<ItemCreator onCreated={() => {}} />);
    const card = await screen.findByTestId("perfume-item-creator");
    fireEvent.change(within(card).getByTestId("perfume-new-brand"), { target: { value: "ZZ" } });
    fireEvent.change(within(card).getByTestId("perfume-new-name"), { target: { value: "PACK" } });
    fireEvent.change(within(card).getByTestId("perfume-new-pos-code"), { target: { value: "ZZ-02" } });
    fireEvent.change(within(card).getByTestId("perfume-new-ticket"), { target: { value: "ZZ PACK" } });
    fireEvent.change(within(card).getByTestId("perfume-new-sold-by"), { target: { value: "pack" } });
    fireEvent.change(within(card).getByTestId("perfume-new-units-per-pack"), { target: { value: "12" } });
    fireEvent.change(within(card).getByTestId("perfume-new-special"), { target: { value: "$20" } });
    fireEvent.click(within(card).getByTestId("perfume-new-save"));
    await waitFor(() => expect(calls.find(([p]) => p === "/api/v1/perfume/item-file")?.[1]).toMatchObject({
      brand: "ZZ", name: "PACK", pos_code: "ZZ-02", ticket_description: "ZZ PACK", sold_by: "pack", units_per_pack: 12, special_price_cents: 2000 }));
  });
});
