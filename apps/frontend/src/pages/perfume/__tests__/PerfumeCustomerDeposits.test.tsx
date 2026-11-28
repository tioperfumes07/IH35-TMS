import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as clientApi from "../../../api/client";
import { ToastProvider } from "../../../components/Toast";
import { PerfumeReceivablesPanel } from "../PerfumeReceivablesPanel";

// Pre-open the customer account via ?open=cu1 so CustomerAccount renders immediately.
const mount = (ui: React.ReactNode) =>
  render(
    <MemoryRouter initialEntries={["/?tab=receivables&open=cu1"]}>
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <ToastProvider>{ui}</ToastProvider>
      </QueryClientProvider>
    </MemoryRouter>
  );

vi.mock("../../../api/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../api/client")>()),
  apiRequest: vi.fn(),
}));

// ROUND L.31 M1: multi-invoice payment + unapplied payments (money before the invoice — the customer credit on A/R, QuickBooks style).
// A payment recorded with no apply_to sits as unapplied credit on A/R.
// The CustomerDeposits section shows those unapplied payments and lets the owner apply them
// to open invoices via POST /api/v1/accounting/payments/:id/applications.
const COMPANY_ID = "co1";
const CUSTOMER_ID = "cu1";

const fakeAging = {
  as_of: "2026-11-27", days: { d1: 30, d2: 60, d3: 90 },
  totals: { current: 50000, b1: 0, b2: 0, b3: 0, total: 50000 },
  customers: [{ customer_id: CUSTOMER_ID, customer: "Perfumes El Sol", perfume_company_id: null, current: 50000, b1: 0, b2: 0, b3: 0, total: 50000, invoices: 1, oldest_days: 10 }],
};
const fakeAccount = {
  as_of: "2026-11-27", days: { d1: 30, d2: 60, d3: 90 },
  operating_company_id: COMPANY_ID,
  customer: { id: CUSTOMER_ID, name: "Perfumes El Sol", perfume_company_id: null, terms_days: 30, credit_limit_cents: null },
  buckets: { current: 50000, b1: 0, b2: 0, b3: 0, total: 50000 },
  open_invoices: [{ id: "inv1", number: "INV-001", status: "sent", issue_date: "2026-11-15", due_date: "2026-12-15", days: 12, total_cents: 50000, paid_cents: 0, open_cents: 50000, bucket: "current" as const, payments: [] }],
  invoices: [{ id: "inv1", number: "INV-001", status: "sent", issue_date: "2026-11-15", due_date: "2026-12-15", days: 12, total_cents: 50000, paid_cents: 0, open_cents: 50000, bucket: "current" as const, payments: [] }],
  payments: [
    // Unapplied: a payment recorded BEFORE the invoice (the "deposit")
    { id: "pmt1", number: "PMT-001", date: "2026-11-10", method: "check", reference: "CHK-5001", amount_cents: 20000, applied_cents: 0, unapplied_cents: 20000, voided_at: null, void_reason: null },
    // Fully applied: must NOT appear in the deposits section
    { id: "pmt2", number: "PMT-002", date: "2026-11-20", method: "wire", reference: null, amount_cents: 10000, applied_cents: 10000, unapplied_cents: 0, voided_at: null, void_reason: null },
  ],
};
const applyResult = { id: "app1", payment_amount_unapplied_cents: 0, invoice_amount_open_cents: 30000, invoice_status: "partial" };

describe("unapplied payments", () => {
  const calls: Array<[string, unknown]> = [];
  beforeEach(() => {
    calls.length = 0;
    vi.mocked(clientApi.apiRequest).mockImplementation(async (path: string, opts?: { method?: string; body?: unknown }) => {
      calls.push([path, opts?.body]);
      if (path.startsWith("/api/v1/scentsx/receivables/aging")) return fakeAging;
      if (path.startsWith(`/api/v1/scentsx/receivables/customers/${CUSTOMER_ID}`)) return fakeAccount;
      if (path.startsWith(`/api/v1/accounting/payments/pmt1/applications`) && opts?.method === "POST") return applyResult;
      // credit-memos for PerfumeCustomerCredits
      if (path.includes("credit-memos")) return { credit_memos: [] };
      // customer statement of account for CustomerStatement
      if (path.includes("/statement")) return { lines: [], opening_balance_cents: 0, closing_balance_cents: 0 };
      return { rows: [], accounts: [], credit_memos: [], lines: [] };
    });
  });

  it("shows deposit section with unapplied payment; hides fully-applied payment", async () => {
    mount(<PerfumeReceivablesPanel />);
    // Deposits section should appear — PMT-001 is unapplied
    expect(await screen.findByTestId("perfume-ar-deposits")).toBeTruthy();
    const depositsSection = screen.getByTestId("perfume-ar-deposits");
    expect(depositsSection).toHaveTextContent("PMT-001");
    // PMT-002 (fully applied) must NOT appear in the deposits section
    expect(depositsSection).not.toHaveTextContent("PMT-002");
  });

  it("apply deposit → POST /payments/:id/applications with correct invoice_id and amount", async () => {
    mount(<PerfumeReceivablesPanel />);
    expect(await screen.findByTestId("perfume-ar-deposit-apply-pmt1")).toBeTruthy();
    fireEvent.click(screen.getByTestId("perfume-ar-deposit-apply-pmt1"));
    // Modal opens
    expect(await screen.findByTestId("perfume-ar-apply-deposit-modal")).toBeTruthy();
    // Confirm with the pre-filled amount (20000 = $200.00)
    fireEvent.click(screen.getByTestId("perfume-ar-deposit-apply-confirm"));
    await waitFor(() => expect(calls.some(([p]) => (p as string).startsWith("/api/v1/accounting/payments/pmt1/applications"))).toBe(true));
    const applyCall = calls.find(([p]) => (p as string).startsWith("/api/v1/accounting/payments/pmt1/applications"));
    expect(applyCall?.[1]).toMatchObject({ invoice_id: "inv1", amount_cents: 20000 });
  });
});
