import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";

const listMock = vi.fn();
vi.mock("../../../api/factoring-purchases", () => ({ listFactoringPurchases: (...a: unknown[]) => listMock(...a) }));

import { FactoringPurchaseLinksPanel } from "../FactoringPurchaseLinksPanel";

function wrap(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>
  );
}

describe("FactoringPurchaseLinksPanel (§10-B reverse drill)", () => {
  it("lists the purchase with its money and links for an invoice", async () => {
    listMock.mockResolvedValue({
      purchases: [{
        id: "p1", display_id: "FP-2026-00001", status: "posted", purchase_date: "2026-10-01", wire_date: null, faro_report_ref: null,
        invoice_count: 2, gross_cents: 860000, escrow_reserve_cents: 12900, cash_reserve_cents: 0, fee_cents: 12900, wire_fee_cents: 2000,
        advance_cents: 834200, net_to_company_cents: 832200, factoring_advance_id: "a1", journal_entry_id: "je1", posted_at: null, voided_at: null,
        bank_transaction_id: "bt1", factoring_company_name: "Faro",
        line_count: 1, line_gross_cents: 340000, line_escrow_reserve_cents: 5100, line_cash_reserve_cents: 0, line_fee_cents: 5100,
      }],
    });
    wrap(<FactoringPurchaseLinksPanel companyId="co" filter={{ invoice_id: "inv1" }} />);
    expect(await screen.findByText("FP-2026-00001")).toBeTruthy();
    expect(listMock).toHaveBeenCalledWith("co", { invoice_id: "inv1" });
    // the invoice's OWN share of the wire, not the wire total
    expect(screen.getByText("$3,400.00")).toBeTruthy();
    expect(screen.queryByText("$8,600.00")).toBeNull();
    expect(screen.getByText("Funding JE")).toBeTruthy();
    expect(screen.getByText("Matched deposit")).toBeTruthy();
  });

  it("states plainly when nothing is factored", async () => {
    listMock.mockResolvedValue({ purchases: [] });
    wrap(<FactoringPurchaseLinksPanel companyId="co" filter={{ load_id: "l1" }} emptyText="Not sold to the factor." />);
    expect(await screen.findByText("Not sold to the factor.")).toBeTruthy();
  });
});
