import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import * as clientApi from "../../../api/client";
import { ToastProvider } from "../../../components/Toast";
import PerfumeDeskPage from "../PerfumeDeskPage";

vi.mock("../../../auth/useAuth", () => ({ useAuth: () => ({ user: { uuid: "u", role: "Owner" } }) }));
vi.mock("../../../api/client", async (importOriginal) => ({ ...(await importOriginal<typeof import("../../../api/client")>()), apiRequest: vi.fn() }));
const GRID = { cols: [
  { key: "brand", label: "Brand", group: "Item", kind: "text" }, { key: "v:pca:price", label: "List price", group: "PCA", kind: "money" },
  { key: "my_offer_price", label: "My offer price", group: "Mine", kind: "money" }, { key: "s:esp:price", label: "List price", group: "Competitor · ESPERANZA", kind: "money" },
  { key: "a:offer", label: "OFFER PRICE", group: "SALES", kind: "money" },
], rows: [{ id: "i1", brand: "BHARARA", "v:pca:price": 3500, my_offer_price: 4200, "s:esp:price": 3850, "a:offer": 4200 }], total: 1, facets: {}, rules: {}, vendors: [], measured_at: "x" };

describe("Competition + List analysis (owner 2026-11-14)", () => {
  it("Competition asks only for items on the competitor's list by default; the box turns it off; List analysis tab exists", async () => {
    const paths: string[] = [];
    vi.mocked(clientApi.apiRequest).mockImplementation(async (path: string) => {
      paths.push(path);
      if (path === "/api/v1/perfume/access") return { allowed: true };
      if (path.startsWith("/api/v1/perfume/review")) return { rows: [], total: 0 };
      if (path.startsWith("/api/v1/perfume/grid")) return GRID;
      throw new Error(`unexpected ${path}`);
    });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}><ToastProvider><MemoryRouter initialEntries={["/perfume?tab=comp"]}><PerfumeDeskPage /></MemoryRouter></ToastProvider></QueryClientProvider>);
    await waitFor(() => expect(paths.some((p) => p.includes("view=comp") && p.includes("carried=1"))).toBe(true));
    const box = (await screen.findByTestId("perfume-carried")).querySelector("input")!;
    expect(box.checked).toBe(true);
    fireEvent.click(box);
    await waitFor(() => expect(paths.some((p) => p.includes("view=comp") && !p.includes("carried=1"))).toBe(true));
    expect(screen.getByRole("button", { name: "List analysis" })).toBeTruthy();
  });
});
