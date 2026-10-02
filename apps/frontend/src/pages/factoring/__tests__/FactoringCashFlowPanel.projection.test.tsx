// Lead ROUND 297 — the projected row has ONE base (the open amount Faro would purchase) and names the invoices that have no
// factor agreement instead of folding them in at a silent $0.00.
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";

const purchases = vi.fn();
const candidates = vi.fn();
vi.mock("../../../api/factoring-purchases", () => ({
  listFactoringPurchases: (...a: unknown[]) => purchases(...a),
  listPurchaseCandidates: (...a: unknown[]) => candidates(...a),
}));

import { FactoringCashFlowPanel } from "../FactoringCashFlowPanel";

const priced = (id: string, base: number) => ({
  invoice_id: id, total_cents: base + 10000, open_cents: base, base_cents: base, rate_source: "customer_assignment", rate_reason: null,
  expected_escrow_reserve_cents: Math.round(base * 0.015), expected_cash_reserve_cents: 0, expected_fee_cents: Math.round(base * 0.015),
});
const unpriced = (id: string, base: number) => ({
  invoice_id: id, total_cents: base, open_cents: base, base_cents: base, rate_source: "none", rate_reason: "No factor agreement covers this customer on this date",
  expected_escrow_reserve_cents: null, expected_cash_reserve_cents: null, expected_fee_cents: null,
});

describe("FactoringCashFlowPanel projected row", () => {
  it("computes gross and reserve on the same open base and names the unpriced invoices", async () => {
    purchases.mockResolvedValue({ purchases: [] });
    candidates.mockResolvedValue({ candidates: [priced("a", 100000), priced("b", 200000), unpriced("c", 318000)] });
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <MemoryRouter><FactoringCashFlowPanel companyId="co" dateFrom="" dateTo="" /></MemoryRouter>
      </QueryClientProvider>
    );
    expect(await screen.findByText(/1 invoice\(s\) with no factor agreement excluded/)).toBeTruthy();
    // open base 300,000 (not total 320,000), reserve 1.5% of it = 4,500
    expect(screen.getAllByText("$3,000.00").length).toBeGreaterThan(0);
    expect(screen.getAllByText("$45.00").length).toBeGreaterThan(0);
  });
});
