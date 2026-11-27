import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as clientApi from "../../../api/client";
import { ToastProvider } from "../../../components/Toast";
import { PerfumeItemFilePanel, PerfumeLinkagePanel } from "../PerfumeItemFilePanel";

vi.mock("../../../api/client", async (importOriginal) => ({ ...(await importOriginal<typeof import("../../../api/client")>()), apiRequest: vi.fn() }));

// Owner 2026-11-26 22:51 CT: UPCs, TIO codes and HK codes on the item file, editable; the linkage screen.
const row = { id: "i1", display_name: "ARIANA GRANDE · GOD IS A WOMAN · 100 ml", brand: "ARIANA GRANDE", name: "GOD IS A WOMAN", size_ml: 100, conc: "EDP", gender: "W", flags: [],
  tio_code: "56014815", upcs: ["812256028475"], hk_codes: ["108092"], lists_linked: 7, best_cost_cents: 4450, my_avg_cost_cents: 4600, my_last_cost_cents: 4800 };
const calls: Array<[string, unknown]> = [];
beforeEach(() => {
  calls.length = 0;
  vi.mocked(clientApi.apiRequest).mockImplementation(async (path: string, opts?: { method?: string; body?: unknown }) => {
    if (opts?.method) calls.push([path, opts.body]);
    if (path.startsWith("/api/v1/perfume/item-file-fill-codes")) return { codes_on_list: 467, will_fill: 460, sample: [] };
    if (path === "/api/v1/perfume/item-file/i1" && opts?.method === "PATCH") return { ok: true };
    if (path === "/api/v1/perfume/item-file/i1/upcs") return { upc: "812256028476", moved_from: null, lines_relinked: 2 };
    if (path === "/api/v1/perfume/item-file/i1") return { item: { id: "i1", internal_code: "56014815", brand: "ARIANA GRANDE", name: "GOD IS A WOMAN", size_ml: "100", conc: "EDP", gender: "W", flags: [], display_name: row.display_name },
      upcs: ["812256028475"], vendor_lines: [{ id: "l1", vendor_id: "v1", vendor: "PCA", kind: "buy", sku: "PCA-1", upc: "812256028475", brand: null, description: "AG GOD IS A WOMAN 3.4 EDP W", size_text: null, price_cents: 4450, qty: null, match_method: "upc", list_date: "2026-11-24" }],
      remembered: [], quotes: [], orders: [], purchase_orders: [], best_cost_cents: 4450, hk_codes: [{ id: "a1", sku: "108092", list: "TIO · My inventory", method: "desk", confirmed_at: null }],
      costs: { my_avg_cost_cents: 4600, my_last_cost_cents: 4800 }, events: [] };
    if (path.startsWith("/api/v1/perfume/item-file")) return { total: 1, rows: [row], counts: { items: 30916, with_tio: 0, with_hk: 4500, with_upc: 22704 } };
    if (path.startsWith("/api/v1/perfume/linkage")) return { q: "812256028475", upc: "812256028475", items: [{ id: "i1", display_name: row.display_name, tio_code: "56014815", upcs: ["812256028475"] }],
      lines: [{ line_id: "l1", vendor_id: "v1", vendor: "PCA", kind: "buy", sku: "PCA-1", upc: "812256028475", brand: null, description: "AG GOD IS A WOMAN 3.4 EDP W", size_text: null, price_cents: 4450,
        match_status: "matched", match_method: "upc", list_date: "2026-11-24", item_id: "i1", item: row.display_name, tio_code: "56014815", found_by: "upc" },
        { line_id: "l2", vendor_id: "v2", vendor: "MTZ", kind: "buy", sku: "M-9", upc: "812256028475", brand: null, description: "ARIANA GOD IS WOMAN EDP 100", size_text: null, price_cents: 4500,
        match_status: "review", match_method: null, list_date: "2026-11-25", item_id: null, item: null, tio_code: null, found_by: "upc" }] };
    if (path.startsWith("/api/v1/perfume/rows/l2/confirm")) return { item_id: "i1", rows_linked: 1 };
    throw new Error(`unexpected ${path}`);
  });
});
const mount = (ui: React.ReactNode, at = "/perfume") => render(<MemoryRouter initialEntries={[at]}><QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><ToastProvider>{ui}</ToastProvider></QueryClientProvider></MemoryRouter>);

describe("item file and linkage", () => {
  it("lists TIO / HK / UPC codes, edits the TIO code, adds a UPC", async () => {
    mount(<PerfumeItemFilePanel />);
    const k = await screen.findByTestId("perfume-itemfile-kpis");
    await waitFor(() => expect(within(k).getByText("30,916")).toBeTruthy());
    expect(await screen.findByTestId("perfume-itemfile-fill")).toBeTruthy();
    fireEvent.click((await screen.findAllByText(row.display_name))[0]!);
    const ed = await screen.findByTestId("perfume-itemfile-editor");
    await waitFor(() => expect(ed.textContent).toContain("108092"));
    fireEvent.change(within(ed).getByTestId("perfume-itemfile-tio"), { target: { value: "T-1" } });
    fireEvent.click(within(ed).getByTestId("perfume-itemfile-save"));
    await waitFor(() => expect(calls).toContainEqual(["/api/v1/perfume/item-file/i1", { tio_code: "T-1" }]));
    fireEvent.change(within(ed).getByTestId("perfume-itemfile-upc-input"), { target: { value: "812256028476" } });
    fireEvent.click(within(ed).getByTestId("perfume-itemfile-upc-add"));
    await waitFor(() => expect(calls).toContainEqual(["/api/v1/perfume/item-file/i1/upcs", { upc: "812256028476" }]));
  });
  it("linkage by UPC: the item, every line with each vendor's words; an unlinked line links in one click", async () => {
    mount(<PerfumeLinkagePanel />, "/perfume?tab=linkage&open=812256028475");
    const items = await screen.findByTestId("perfume-linkage-items");
    await waitFor(() => expect(items.textContent).toContain("TIO 56014815"));
    expect(await screen.findByText("ARIANA GOD IS WOMAN EDP 100")).toBeTruthy();
    fireEvent.click(await screen.findByTestId("perfume-linkage-link-l2"));
    await waitFor(() => expect(calls).toContainEqual(["/api/v1/perfume/rows/l2/confirm", { item_id: "i1" }]));
  });
});
