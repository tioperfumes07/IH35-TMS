import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as clientApi from "../../../api/client";
import { ToastProvider } from "../../../components/Toast";
import PerfumeDeskPage from "../PerfumeDeskPage";

vi.mock("../../../auth/useAuth", () => ({ useAuth: () => ({ user: { uuid: "u", role: "Owner" } }) }));
vi.mock("../../../api/client", async (importOriginal) => ({ ...(await importOriginal<typeof import("../../../api/client")>()), apiRequest: vi.fn() }));

// Owner 2026-11-27 15:47 CT: "like quickbooks … if i click on a vendor in a list, it should give me its profile etc. if i click on brands
// … it should take me to those".
const COLS = [
  { key: "brand", label: "Brand", group: "Item", kind: "text" },
  { key: "name", label: "Name", group: "Item", kind: "text" },
  { key: "best_vendor", label: "Buy from", group: "Mine", kind: "text" },
];
const ROWS = [{ id: "11111111-1111-4111-8111-111111111111", brand: "ARMAF", name: "CDN", best_vendor: "Perfume Center of America (Kanak) | Miami Trading Zone (MTZ)" }];
const gridCalls: string[] = [];
function Where() { return <span data-testid="where">{useLocation().search}</span>; }
beforeEach(() => {
  gridCalls.length = 0;
  window.localStorage.clear();
  vi.mocked(clientApi.apiRequest).mockImplementation(async (path: string) => {
    if (path === "/api/v1/perfume/access") return { allowed: true };
    if (path === "/api/v1/perfume/vendors") return { vendors: [
      { id: "v-pca", name: "Perfume Center of America (Kanak)", short_name: "PCA", kind: "buy", roles: ["purchase"] },
      { id: "v-mtz", name: "Miami Trading Zone (MTZ)", short_name: "MTZ", kind: "buy", roles: ["purchase"] }] };
    if (path.startsWith("/api/v1/perfume/grid")) { gridCalls.push(path); return { cols: COLS, rows: ROWS, total: 1, facets: {}, rules: {}, vendors: [], target_pct: 15, earn_pct: 16, measured_at: "2026-11-27T22:00:00.000Z" }; }
    if (path.startsWith("/api/v1/perfume/")) return {};
    throw new Error(`unexpected ${path}`);
  });
});
describe("desk grid click-through", () => {
  it("each vendor name opens its supplier profile; a brand narrows the grid to that brand", async () => {
    render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><ToastProvider>
      <MemoryRouter initialEntries={["/perfume?tab=all"]}><PerfumeDeskPage /><Where /></MemoryRouter></ToastProvider></QueryClientProvider>);
    const links = await screen.findAllByTestId("perfume-grid-vendor-link");
    expect(links.map((l) => l.textContent)).toEqual(["Perfume Center of America (Kanak)", "Miami Trading Zone (MTZ)"]);
    fireEvent.click(links[1]!);
    await waitFor(() => expect(screen.getByTestId("where").textContent).toContain("open=v-mtz"));
    expect(screen.getByTestId("where").textContent).toContain("tab=suppliers");
  });
  it("brand click asks the grid for that brand only", async () => {
    render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><ToastProvider>
      <MemoryRouter initialEntries={["/perfume?tab=all"]}><PerfumeDeskPage /></MemoryRouter></ToastProvider></QueryClientProvider>);
    fireEvent.click(await screen.findByTestId("perfume-grid-brand-link"));
    await waitFor(() => expect(gridCalls.some((p) => p.includes("brand=ARMAF"))).toBe(true));
  });
});
