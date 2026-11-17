import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as clientApi from "../../../api/client";
import { ToastProvider } from "../../../components/Toast";
import PerfumeDeskPage from "../PerfumeDeskPage";
import { MY_PRICE_FIXTURES, myPriceMath } from "../perfumePriceMath";

vi.mock("../../../auth/useAuth", () => ({ useAuth: () => ({ user: { uuid: "u", role: "Owner" } }) }));
vi.mock("../../../api/client", async (importOriginal) => ({ ...(await importOriginal<typeof import("../../../api/client")>()), apiRequest: vi.fn() }));

// Owner 2026-11-17 14:04 CT: my list price, my last cost and my avg cost with margin / markup on every tab; every price box
// of my lists editable and the margin recomputed at once; the competitor description switched on and off.
const COLS = [
  { key: "brand", label: "Brand", group: "Item", kind: "text" },
  { key: "name", label: "Name", group: "Item", kind: "text" },
  { key: "my_offer_price", label: "My list price", group: "Mine", kind: "money" },
  { key: "my_last_cost", label: "My last cost", group: "Mine", kind: "money" },
  { key: "my_avg_cost", label: "My avg cost", group: "Mine", kind: "money" },
  { key: "offer_margin_pct", label: "My margin % (last cost)", group: "Mine", kind: "pct" },
  { key: "offer_markup_pct", label: "My markup % (last cost)", group: "Mine", kind: "pct" },
  { key: "offer_margin_avg_pct", label: "My margin % (avg cost)", group: "Mine", kind: "pct" },
  { key: "offer_markup_avg_pct", label: "My markup % (avg cost)", group: "Mine", kind: "pct" },
  { key: "s:e:desc", label: "Their description", group: "Competitor · ESPERANZA", kind: "text" },
  { key: "s:e:price", label: "List price", group: "Competitor · ESPERANZA", kind: "money" },
  { key: "t:a:list", label: "Their list price", group: "Trade · PCA", kind: "money" },
];
const ROWS = [
  { id: "i1", brand: "ARMAF", name: "CDN", in_offer: 1, my_offer_price: 2000, my_last_cost: 1500, my_avg_cost: null, ...myPriceMath(2000, 1500, null, null), "s:e:desc": "CLUB DE NUIT M 3.6", "s:e:price": 2100, "t:a:list": 1800 },
  { id: "i2", brand: "LATTAFA", name: "ASAD", in_offer: 0, my_offer_price: null, my_last_cost: null, my_avg_cost: null, ...myPriceMath(null, null, null, null), "s:e:desc": "ASAD", "s:e:price": 1300, "t:a:list": 1250 },
];
const puts: unknown[] = [];
let server = ROWS.map((r) => ({ ...r }));
function mount(tab: string) {
  puts.length = 0;
  server = ROWS.map((r) => ({ ...r }));
  vi.mocked(clientApi.apiRequest).mockImplementation(async (path: string, opts?: { method?: string; body?: unknown }) => {
    if (path === "/api/v1/perfume/access") return { allowed: true };
    if (path.startsWith("/api/v1/perfume/review")) return { rows: [], total: 0 };
    if (path === "/api/v1/perfume/mine/price" && opts?.method === "PUT") {
      puts.push(opts.body);
      // The server keeps the price; its rebuild returns the same math the screen ran.
      const b = opts.body as { item_id: string; field: string; cents: number };
      server = server.map((r) => (r.id !== b.item_id ? r : (() => {
        const n = { ...r, ...(b.field === "offer" ? { my_offer_price: b.cents } : b.field === "last_cost" ? { my_last_cost: b.cents } : { my_avg_cost: b.cents }) };
        return { ...n, ...myPriceMath(n.my_offer_price, n.my_last_cost, n.my_avg_cost, null) };
      })()));
      return { ok: true, updated: 1 };
    }
    if (path.startsWith("/api/v1/perfume/grid")) return { cols: COLS, rows: server, total: 2, facets: {}, rules: {}, vendors: [], target_pct: 15, earn_pct: 16, measured_at: "2026-11-17T20:00:00.000Z" };
    throw new Error(`unexpected ${path}`);
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><ToastProvider><MemoryRouter initialEntries={[`/perfume?tab=${tab}`]}><PerfumeDeskPage /></MemoryRouter></ToastProvider></QueryClientProvider>);
}

describe("Perfume desk — my list price, costs, margins", () => {
  beforeEach(() => { window.localStorage.clear(); });
  it("the screen's math is the server's math (same fixtures)", () => {
    for (const f of MY_PRICE_FIXTURES) expect(myPriceMath(...f.in)).toEqual(f.out);
  });
  it.each(["buy", "trade", "wholesale", "comp"])("%s shows my list price, last cost, avg cost, margin and markup by default", async (tab) => {
    mount(tab);
    await screen.findByTestId("perfume-item-toggle");
    for (const h of [/^My list price/, /^My last cost/, /^My avg cost/, /^My margin % \(last cost\)/, /^My markup % \(last cost\)/, /^My margin % \(avg cost\)/, /^My markup % \(avg cost\)/]) {
      expect(screen.getAllByRole("columnheader", { name: h }).length).toBeGreaterThan(0);
    }
  });
  it("typing my list price saves it and the margin recomputes on the row at once", async () => {
    mount("trade");
    const box = (await screen.findAllByTestId("perfume-price-my_offer_price"))[0] as HTMLInputElement;
    expect(box.value).toBe("20.00");
    fireEvent.change(box, { target: { value: "19.50" } });
    fireEvent.keyDown(box, { key: "Enter" });
    await waitFor(() => expect(puts).toEqual([{ item_id: "i1", line_id: null, field: "offer", cents: 1950 }]));
    // (19.50 − 15.00) ÷ 19.50 = 23.1 % · (19.50 − 15.00) ÷ 15.00 = 30.0 %
    await waitFor(() => expect(screen.getAllByText("23.1%").length).toBeGreaterThan(0));
    expect(screen.getAllByText("30.0%").length).toBeGreaterThan(0);
  });
  it("an item not on my list has no list-price box; its cost box still saves", async () => {
    mount("trade");
    await screen.findAllByTestId("perfume-price-my_offer_price");
    expect(screen.getAllByTestId("perfume-price-my_offer_price").length).toBe(1);
    const cost = screen.getAllByTestId("perfume-price-my_avg_cost")[1] as HTMLInputElement;
    fireEvent.change(cost, { target: { value: "8.25" } });
    fireEvent.blur(cost);
    await waitFor(() => expect(puts).toEqual([{ item_id: "i2", line_id: null, field: "avg_cost", cents: 825 }]));
  });
  it("the competitor description switches off and back on", async () => {
    mount("wholesale");
    const t = await screen.findByTestId("perfume-desc-toggle");
    expect(screen.getAllByRole("columnheader", { name: /^Their description/ }).length).toBeGreaterThan(0);
    fireEvent.click(t);
    await waitFor(() => expect(screen.queryByRole("columnheader", { name: /^Their description/ })).toBeNull());
    fireEvent.click(screen.getByTestId("perfume-desc-toggle"));
    await waitFor(() => expect(screen.getAllByRole("columnheader", { name: /^Their description/ }).length).toBeGreaterThan(0));
    expect(within(document.body).getByTestId("perfume-desc-toggle").textContent).toContain("Hide competitor description");
  });
});
