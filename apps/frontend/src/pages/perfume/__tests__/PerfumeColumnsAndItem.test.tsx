import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as clientApi from "../../../api/client";
import { ToastProvider } from "../../../components/Toast";
import PerfumeDeskPage from "../PerfumeDeskPage";

vi.mock("../../../auth/useAuth", () => ({ useAuth: () => ({ user: { uuid: "u", role: "Owner" } }) }));
vi.mock("../../../api/client", async (importOriginal) => ({ ...(await importOriginal<typeof import("../../../api/client")>()), apiRequest: vi.fn() }));

// Owner 2026-11-16 19:23–19:24 CT: frozen headers, an item-section switch, every column (Mine, brand, size, type, my last
// cost …) selectable in the gear by section, and my offer price green when it is at or under everybody else's.
const COLS = [
  { key: "brand", label: "Brand", group: "Item", kind: "text" },
  { key: "name", label: "Name", group: "Item", kind: "text" },
  { key: "size_ml", label: "Size ml", group: "Item", kind: "text" },
  { key: "my_last_cost", label: "My actual cost (last purchase)", group: "Mine", kind: "money" },
  { key: "my_offer_price", label: "My offer price", group: "Mine", kind: "money" },
  { key: "v:a:price", label: "List price", group: "PCA", kind: "money" },
  { key: "v:b:price", label: "List price", group: "MTZ", kind: "money" },
];
function mount(tab = "buy") {
  vi.mocked(clientApi.apiRequest).mockImplementation(async (path: string) => {
    if (path === "/api/v1/perfume/access") return { allowed: true };
    if (path.startsWith("/api/v1/perfume/review")) return { rows: [], total: 0 };
    if (path.startsWith("/api/v1/perfume/grid")) return { cols: COLS, rows: [
      { id: "i1", brand: "ARMAF", name: "CDN", size_ml: 105, my_last_cost: 1500, my_offer_price: 1800, "v:a:price": 1800, "v:b:price": 1900 },
      { id: "i2", brand: "LATTAFA", name: "ASAD", size_ml: 100, my_last_cost: 900, my_offer_price: 1300, "v:a:price": 1250, "v:b:price": null },
    ], total: 2, facets: {}, rules: {}, vendors: [], target_pct: 11, earn_pct: 16, measured_at: "2026-11-17T01:00:00.000Z" };
    throw new Error(`unexpected ${path}`);
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><ToastProvider><MemoryRouter initialEntries={[`/perfume?tab=${tab}`]}><PerfumeDeskPage /></MemoryRouter></ToastProvider></QueryClientProvider>);
}

describe("Perfume desk columns", () => {
  beforeEach(() => { window.localStorage.clear(); });
  it("the table scrolls in its own box so the header freezes", async () => {
    mount();
    await screen.findByTestId("perfume-item-toggle");
    const box = screen.getByTestId("parity-table-scrollbox");
    expect(box.className).toContain("overflow-auto");
    expect(box.style.maxHeight).toContain("100vh");
  });
  it("Hide item columns takes Brand / Name / Size away and Show brings them back", async () => {
    mount();
    const t = await screen.findByTestId("perfume-item-toggle");
    expect(screen.getAllByText("Brand").length).toBeGreaterThan(0);
    fireEvent.click(t);
    await waitFor(() => expect(screen.queryByRole("columnheader", { name: /^Brand/ })).toBeNull());
    expect(screen.getByTestId("perfume-item-toggle").textContent).toContain("Show item columns");
    fireEvent.click(screen.getByTestId("perfume-item-toggle"));
    await waitFor(() => expect(screen.getByRole("columnheader", { name: /^Brand/ })).toBeTruthy());
  });
  it("the gear lists every column by section and turns one on", async () => {
    mount();
    await screen.findByTestId("perfume-item-toggle");
    fireEvent.click(screen.getByRole("button", { name: "Table settings" }));
    const panel = await screen.findByTestId("perfume-columns-panel");
    expect(panel.textContent).toContain("Mine");
    expect(panel.textContent).toContain("PCA");
    const offer = screen.getByTestId("perfume-col-my_offer_price") as HTMLInputElement;
    expect(offer.checked).toBe(false);
    fireEvent.click(offer);
    await waitFor(() => expect((screen.getByTestId("perfume-col-my_offer_price") as HTMLInputElement).checked).toBe(true));
    expect(screen.getAllByRole("columnheader", { name: /My offer price/ }).length).toBeGreaterThan(0);
  });
  it("my offer price is green when at or under everybody else's price, not otherwise", async () => {
    window.localStorage.setItem("perfume-cols-buy-v1", JSON.stringify({ choices: { my_offer_price: true }, itemOff: false }));
    mount();
    await waitFor(() => expect(screen.getAllByTestId("perfume-offer-lowest").length).toBe(1));
    expect(screen.getByTestId("perfume-offer-lowest").textContent).toContain("18.00");
  });
});
