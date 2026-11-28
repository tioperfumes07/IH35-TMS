import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as clientApi from "../../../api/client";
import { PerfumeVendorRankingPanel } from "../PerfumeVendorRankingPanel";

vi.mock("../../../api/client", async (importOriginal) => ({ ...(await importOriginal<typeof import("../../../api/client")>()), apiRequest: vi.fn() }));

// ROUND L.31 M27: vendors ranked by ScentsX's bills; the tier cards filter; a vendor never bought from has no tier.
const row = (id: string, vendor: string, billed: number, tier: "A" | "B" | "C" | null, rank: number | null) => ({ vendor_id: id, vendor, company_id: null, billed_cents: billed,
  billed12_cents: billed, bills: billed ? 1 : 0, ordered_cents: 0, received_cents: 0, pos: 0, last_po_date: null, last_bill_date: billed ? "2026-11-20" : null, price_rows: 120, tier, rank, share: billed / 1000000 });
beforeEach(() => {
  vi.mocked(clientApi.apiRequest).mockImplementation(async (path: string) => {
    if (path === "/api/v1/perfume/vendors/ranking") return { total_billed_cents: 1000000, vendors: 3, bought_from: 2, tiers: { A: 1, B: 1, C: 0 }, ordered_cents: 25000,
      rows: [row("v1", "Big Distributor", 900000, "A", 1), row("v2", "Mid Distributor", 100000, "B", 2), row("v3", "Never Bought", 0, null, null)] };
    throw new Error(`unexpected ${path}`);
  });
});

describe("TIO vendor ranking", () => {
  it("shows billed totals and filters by tier and not-bought-yet", async () => {
    render(<MemoryRouter><QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><PerfumeVendorRankingPanel /></QueryClientProvider></MemoryRouter>);
    expect(await screen.findByText("Big Distributor")).toBeTruthy();
    expect(screen.getAllByText("$9,000.00").length).toBeGreaterThan(0);
    fireEvent.click(screen.getByText("Not bought from yet"));
    await waitFor(() => expect(screen.queryByText("Big Distributor")).toBeNull());
    expect(screen.getByText("Never Bought")).toBeTruthy();
  });
});
