import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "../../../components/Toast";
import { AccountingAuditTrailPage } from "../AccountingAuditTrailPage";
import { ExpensesListPage } from "../ExpensesListPage";
import { InvoiceDetailPage } from "../InvoiceDetailPage";
import { PaymentDetailPage } from "../PaymentDetailPage";
import { FaultDraftsPage } from "../../maintenance/FaultDraftsPage";

const COMPANY_ID = "00000000-0000-4000-8000-000000000099";

const apiMocks = vi.hoisted(() => ({
  getInvoice: vi.fn(),
  getPayment: vi.fn(),
  listAccountingAuditTrail: vi.fn(),
  listCoaAccountsForJe: vi.fn(),
  listExpenses: vi.fn(),
  apiRequest: vi.fn(),
}));

vi.mock("../../../contexts/CompanyContext", () => ({
  useCompanyContext: () => ({ selectedCompanyId: COMPANY_ID }),
}));

vi.mock("../AccountingSubNavWrapper", () => ({
  AccountingSubNavWrapper: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

vi.mock("../../../api/accounting", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../api/accounting")>();
  return {
    ...actual,
    getInvoice: apiMocks.getInvoice,
    getPayment: apiMocks.getPayment,
    listAccountingAuditTrail: apiMocks.listAccountingAuditTrail,
    listCoaAccountsForJe: apiMocks.listCoaAccountsForJe,
    listExpenses: apiMocks.listExpenses,
  };
});

vi.mock("../../../api/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../api/client")>();
  return { ...actual, apiRequest: apiMocks.apiRequest };
});

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="location">{`${location.pathname}${location.search}`}</output>;
}

function renderAt(ui: ReactNode, initialEntry: string, routePath = "*") {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <MemoryRouter initialEntries={[initialEntry]}>
          <LocationProbe />
          <Routes>
            <Route path={routePath} element={ui} />
          </Routes>
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>,
  );
}

function invoiceFixture() {
  return {
    id: "inv-100",
    display_id: "INV-100",
    customer_id: "customer-44",
    customer_name: "Acme Freight",
    status: "sent",
    issue_date: "2026-07-01",
    due_date: "2026-07-31",
    source_load_id: null,
    subtotal_cents: 12_500,
    tax_cents: 0,
    total_cents: 12_500,
    amount_open_cents: 12_500,
    internal_notes: null,
    customer_notes: null,
    lines: [],
    payment_applications: [],
    factoring_advance_id: null,
  };
}

function paymentFixture() {
  return {
    id: "pay-200",
    display_id: "PAY-200",
    customer_id: "customer-44",
    customer_name: "Acme Freight",
    payment_date: "2026-07-02",
    payment_method: "check",
    reference: "CHK-9",
    amount_cents: 10_000,
    amount_applied_cents: 10_000,
    amount_unapplied_cents: 0,
    deposited_to_account_id: null,
    applications: [],
    notes: null,
    voided_at: null,
  };
}

describe("reverse drill-through production behavior", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiMocks.getInvoice.mockResolvedValue(invoiceFixture());
    apiMocks.getPayment.mockResolvedValue(paymentFixture());
    apiMocks.listCoaAccountsForJe.mockResolvedValue({ accounts: [] });
    apiMocks.listAccountingAuditTrail.mockResolvedValue({ events: [], next_cursor: null });
    apiMocks.listExpenses.mockResolvedValue({ rows: [], total: 0 });
    apiMocks.apiRequest.mockResolvedValue({ drafts: [] });
  });

  it("renders the exact invoice customer link and navigates to the exact invoice audit URL", async () => {
    const user = userEvent.setup();
    renderAt(<InvoiceDetailPage />, "/accounting/invoices/inv-100", "/accounting/invoices/:id");

    expect(await screen.findByRole("link", { name: "Acme Freight" })).toHaveAttribute(
      "href",
      "/customers/customer-44",
    );
    await user.click(screen.getByRole("button", { name: "View audit log" }));
    expect(screen.getByTestId("location")).toHaveTextContent(
      "/accounting/audit-trail?source_type=invoice&source_id=inv-100",
    );
  });

  it("navigates from the production payment page with the exact payment ID and source type", async () => {
    const user = userEvent.setup();
    renderAt(<PaymentDetailPage />, "/accounting/payments/pay-200", "/accounting/payments/:id");

    await user.click(await screen.findByRole("button", { name: "View audit log" }));
    expect(screen.getByTestId("location")).toHaveTextContent(
      "/accounting/audit-trail?source_type=customer_payment&source_id=pay-200",
    );
  });

  it("passes both audit search parameters into the production audit query", async () => {
    renderAt(
      <AccountingAuditTrailPage />,
      "/accounting/audit-trail?source_type=invoice&source_id=inv-100",
    );

    await waitFor(() => {
      expect(apiMocks.listAccountingAuditTrail).toHaveBeenCalledWith(
        COMPANY_ID,
        expect.objectContaining({
          source_transaction_type: "invoice",
          source_transaction_id: "inv-100",
        }),
      );
    });
  });

  it("renders an exact expense EntityLink and consumes expense_id on the production list", async () => {
    apiMocks.listExpenses.mockResolvedValue({
      rows: [{
        id: "expense-300",
        expense_number: "EXP-300",
        transaction_date: "2026-07-03",
        status: "posted",
        total_amount_cents: 5000,
        is_reconciled: false,
      }],
      total: 1,
    });
    renderAt(
      <ExpensesListPage />,
      "/accounting/expenses/list?expense_id=expense-300",
    );

    expect(await screen.findByRole("link", { name: "EXP-300" })).toHaveAttribute(
      "href",
      "/accounting/expenses/list?expense_id=expense-300",
    );
    expect(screen.getByText(/Deep-link expense/)).toHaveTextContent("highlighted in the list below");
  });

  it("consumes unit_id by filtering the production fault-drafts surface", async () => {
    apiMocks.apiRequest.mockResolvedValue({
      drafts: [
        {
          id: "draft-a",
          display_id: "WO-A",
          wo_title: "Target unit fault",
          description: "Target",
          status: "draft",
          unit_number: "UNIT-A",
          fault_code: "P100",
          fault_severity: "high",
          fault_occurred_at: "2026-07-03T12:00:00.000Z",
          unit_id: "unit-a",
        },
        {
          id: "draft-b",
          display_id: "WO-B",
          wo_title: "Other unit fault",
          description: "Other",
          status: "draft",
          unit_number: "UNIT-B",
          fault_code: "P200",
          fault_severity: "low",
          fault_occurred_at: "2026-07-03T12:00:00.000Z",
          unit_id: "unit-b",
        },
      ],
    });
    renderAt(<FaultDraftsPage />, "/maintenance/fault-drafts?unit_id=unit-a");

    expect(await screen.findByRole("link", { name: "UNIT-A" })).toHaveAttribute(
      "href",
      "/fleet/units/unit-a",
    );
    expect(screen.queryByRole("link", { name: "UNIT-B" })).not.toBeInTheDocument();
    expect(screen.getByText(/Filtered to unit/)).toBeInTheDocument();
  });
});
