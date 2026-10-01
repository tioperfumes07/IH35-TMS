// ROUND 315 step 3 — Submit to Factor tab: selection totals use the purchase engine's formula, every open invoice
// renders with its links/docs, and a non-Owner sees the owner-only message with Save disabled.
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { ToastProvider } from "../../../components/Toast";
import type { PurchaseCandidate } from "../../../api/factoring-purchases";

const candidate = (over: Partial<PurchaseCandidate> = {}): PurchaseCandidate => ({
  invoice_id: "inv-1",
  invoice_display_id: "13626",
  invoice_status: "sent",
  issue_date: "2026-09-20",
  due_date: "2026-10-20",
  total_cents: 500000,
  open_cents: 500000,
  customer_id: "cust-1",
  customer_name: "Acme Logistics",
  customer_po_number: "PO-77",
  customer_wo_number: null,
  load_id: "load-1",
  load_number: "13626",
  settlement_id: "set-1",
  settlement_display_id: "STL-9",
  settlement_is_presettlement: false,
  settlement_status: "approved",
  pickup_at: "2026-09-18 08:00:00+00",
  delivery_at: "2026-09-19 10:00:00+00",
  factor_id: "f-1",
  factor_name: "Faro",
  reserve_rate: 0.015,
  fee_rate: 0.015,
  cash_reserve_rate: 0,
  expected_escrow_reserve_cents: 7500,
  expected_cash_reserve_cents: 0,
  expected_fee_cents: 7500,
  has_bol: true,
  has_pod: true,
  has_rate_confirmation: true,
  docs_complete: true,
  missing_docs: [],
  ...over,
});

vi.mock("../../../api/factoring-purchases", () => ({
  listPurchaseCandidates: vi.fn(async () => ({
    candidates: [
      candidate(),
      candidate({ invoice_id: "inv-2", invoice_display_id: "13637", load_id: "load-2", load_number: "13637", has_pod: false, docs_complete: false, missing_docs: ["POD"] }),
    ],
    capped: false,
    limit: 2000,
    factoring_vendors: [{ id: "v-1", vendor_name: "Faro Factoring", email: null, is_default: true }],
    as_of: "2026-10-01",
  })),
  listDirectPayInvoices: vi.fn(async () => ({ invoices: [] })),
  markInvoiceDirectPay: vi.fn(),
  undoInvoiceDirectPay: vi.fn(),
  createFactoringPurchase: vi.fn(),
  postFactoringPurchase: vi.fn(),
  voidFactoringPurchase: vi.fn(),
  sendFactoringPurchase: vi.fn(),
}));

const { SubmitToFactorTab, computeSelectionTotals, loadDocsUploadPath, OWNER_ONLY_MESSAGE } = await import("../SubmitToFactorTab");

function wrap(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <ToastProvider>{ui}</ToastProvider>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("SubmitToFactorTab", () => {
  it("totals: advance = gross - escrow - fee; net = advance - cash reserve - wire fee", () => {
    const t = computeSelectionTotals([candidate(), candidate({ invoice_id: "x", open_cents: 300000, expected_escrow_reserve_cents: 4500, expected_fee_cents: 4500, expected_cash_reserve_cents: 3000 })], 2000);
    expect(t).toEqual({ count: 2, gross: 800000, escrow: 12000, cash: 3000, fee: 12000, wire: 2000, advance: 776000, net: 771000 });
  });

  it("links a missing-docs row to the load's Documents tab", () => {
    expect(loadDocsUploadPath("load-2")).toBe("/dispatch/loads/load-2?tab=Documents");
  });

  it("renders every candidate with invoice / load / customer links and a docs cell", async () => {
    render(wrap(<SubmitToFactorTab companyId="co-1" isOwner />));
    await waitFor(() => expect(screen.getByTestId("submit-factor-docs-ok-inv-1")).toBeTruthy());
    expect(screen.getByTestId("submit-factor-docs-upload-inv-2").getAttribute("href")).toBe("/dispatch/loads/load-2?tab=Documents");
    expect(screen.getAllByText("Acme Logistics").length).toBeGreaterThan(0);
    expect(screen.queryByTestId("submit-factor-owner-only-note")).toBeNull();
  });

  it("shows the owner-only message to a non-Owner", async () => {
    render(wrap(<SubmitToFactorTab companyId="co-1" isOwner={false} />));
    expect(screen.getByTestId("submit-factor-owner-only-note").textContent).toContain(OWNER_ONLY_MESSAGE);
    await waitFor(() => expect(screen.getByTestId("submit-factor-direct-pay-inv-1")).toBeTruthy());
    expect((screen.getByTestId("submit-factor-direct-pay-inv-1") as HTMLButtonElement).disabled).toBe(true);
  });
});
