import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as clientApi from "../../../api/client";
import { ToastProvider } from "../../../components/Toast";
import { PerfumeStockLinkagePanel } from "../PerfumeItemFilePanel";

vi.mock("../../../api/client", async (importOriginal) => ({ ...(await importOriginal<typeof import("../../../api/client")>()), apiRequest: vi.fn() }));

// Owner 2026-11-27 06:19 CT: "I think you need to confirm all those perfumes correctly to upcs and vendors".
const calls: Array<[string, unknown]> = [];
beforeEach(() => {
  calls.length = 0;
  vi.mocked(clientApi.apiRequest).mockImplementation(async (path: string, opts?: { method?: string; body?: unknown }) => {
    if (opts?.method) calls.push([path, opts.body]);
    if (path === "/api/v1/perfume/stock-linkage/link") return { lines: 2, into: "DIOR · SAUVAGE · 100 ml" };
    if (path === "/api/v1/perfume/stock-linkage/strict" && opts?.method) return { linked: 1 };
    if (path === "/api/v1/perfume/stock-linkage/strict") return { pairs: [{ mine_id: "m2", mine: "TUMI · ATLAS · 100 ml · EDP · TESTER", vend_id: "v2", vend: "TUMI · ATLAS · 100 ml · EDP · Unisex · TESTER" }] };
    if (path.startsWith("/api/v1/perfume/stock-linkage")) return { total: 1, mine: 3877, linked: 989, rows: [{ id: "m1", display_name: "DIOR · SAUVAGE POUR HOMME · 100 ml", upcs: ["3348901250146"], hk: "108092",
      my_desc: "DIOR SAUVAGE EDT 100ML (M)", candidates: [{ mine_id: "m1", id: "v1", display_name: "DIOR · SAUVAGE · 100 ml", score: 0.7, same_brand: true, exact: true, lists: 9, best_cents: 9100, upcs: null, sample: "CD SAUVAGE 3.4 EDT M" }] }] };
    throw new Error(`unexpected ${path}`);
  });
});
const mount = () => render(<MemoryRouter><QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><ToastProvider><PerfumeStockLinkagePanel /></ToastProvider></QueryClientProvider></MemoryRouter>);

describe("stock linkage", () => {
  it("shows linked counts, links one candidate, previews and applies the sure matches", async () => {
    mount();
    await waitFor(() => expect(screen.getByText("3,877")).toBeTruthy());
    expect(screen.getByText("2,888")).toBeTruthy();
    fireEvent.click(await screen.findByTestId("perfume-stock-link-m1-v1"));
    await waitFor(() => expect(calls).toContainEqual(["/api/v1/perfume/stock-linkage/link", { from_item_id: "m1", to_item_id: "v1" }]));
    fireEvent.click(screen.getByTestId("perfume-stock-link-strict"));
    expect(await screen.findByText("TUMI · ATLAS · 100 ml · EDP · Unisex · TESTER")).toBeTruthy();
    fireEvent.click(await screen.findByTestId("perfume-stock-link-strict-apply"));
    await waitFor(() => expect(calls).toContainEqual(["/api/v1/perfume/stock-linkage/strict", { confirm: true }]));
  });
});
