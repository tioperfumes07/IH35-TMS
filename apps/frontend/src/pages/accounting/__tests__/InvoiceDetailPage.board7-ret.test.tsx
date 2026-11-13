import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "../../../components/Toast";
import { encodeReturnContext } from "../../../lib/returnContext";
import { InvoiceDetailPage } from "../InvoiceDetailPage";

const getInvoiceMock = vi.fn();

vi.mock("../../../api/accounting", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../api/accounting")>();
  return {
    ...actual,
    getInvoice: (...args: unknown[]) => getInvoiceMock(...args),
    getAccountingSourceLineage: vi.fn().mockResolvedValue({ rows: [] }),
  };
});

vi.mock("../../../api/catalog-accounts", () => ({
  listCatalogAccounts: vi.fn().mockResolvedValue({ accounts: [] }),
}));

vi.mock("../../../api/credit-memos", () => ({
  listCreditMemos: vi.fn().mockResolvedValue({ rows: [] }),
}));

vi.mock("../../../api/loads", () => ({
  getLoad: vi.fn(),
}));

vi.mock("../../../contexts/CompanyContext", () => ({
  useCompanyContext: () => ({ selectedCompanyId: "91f6d7d8-0f3a-4c2d-8e1b-2c3d4e5f6071" }),
}));

vi.mock("../AccountingSubNavWrapper", () => ({
  AccountingSubNavWrapper: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("../../../components/shared/EntityLink", () => ({
  EntityLink: ({ label }: { label: string }) => <span>{label}</span>,
}));

vi.mock("../../../components/safety/SafetyAlertsReverseSection", () => ({
  SafetyAlertsReverseSection: () => null,
}));

vi.mock("../../../components/accounting/MoneyProofTrailPanel", () => ({
  MoneyProofTrailPanel: () => null,
}));

vi.mock("../../../components/accounting/PostingGrid", () => ({
  JournalPostingsPanel: () => null,
}));

vi.mock("../../../components/factoring/FactoringPurchaseLinksPanel", () => ({
  FactoringPurchaseLinksPanel: () => null,
}));

describe("ROUND 8.20 board7 — Rolling Ledger → Invoice reverse via ?ret=", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getInvoiceMock.mockResolvedValue({
      id: "inv-board7",
      display_id: "INV-BOARD7",
      customer_id: "customer-44",
      customer_name: "Acme Freight",
      status: "open",
      issue_date: "2026-11-01",
      due_date: "2026-11-30",
      source_load_id: null,
      subtotal_cents: 10_000,
      tax_cents: 0,
      total_cents: 10_000,
      amount_open_cents: 10_000,
      amount_paid_cents: 0,
      internal_notes: null,
      customer_notes: null,
      lines: [],
      payment_applications: [],
      factoring_advance_id: null,
      voided_at: null,
      void_reason: null,
      voided_by_user_id: null,
      matched_bank_transaction_id: null,
    });
  });

  it("PageHeader Back restores Cash Flow Rolling Ledger origin when ret is present", async () => {
    const origin = "/cash-flow?tab=rolling_ledger&rl_from=2026-11-03&scenario=base";
    const ret = encodeReturnContext(origin);
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <MemoryRouter initialEntries={[`/accounting/invoices/inv-board7?ret=${ret}`]}>
        <QueryClientProvider client={queryClient}>
          <ToastProvider>
            <Routes>
              <Route path="/accounting/invoices/:id" element={<InvoiceDetailPage />} />
              <Route path="/cash-flow" element={<div data-testid="cash-flow-restored">cash-flow</div>} />
            </Routes>
          </ToastProvider>
        </QueryClientProvider>
      </MemoryRouter>,
    );

    expect(await screen.findByTestId("page-header-back")).toBeInTheDocument();
    await userEvent.click(screen.getByTestId("page-header-back"));
    expect(await screen.findByTestId("cash-flow-restored")).toBeInTheDocument();
  });
});
