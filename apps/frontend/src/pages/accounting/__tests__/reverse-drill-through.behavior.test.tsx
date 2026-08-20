import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Children, isValidElement, type ReactElement, type ReactNode } from "react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "../../../components/Toast";
import { ROUTES } from "../../../routes/manifest";
import { AccountingAuditTrailPage } from "../AccountingAuditTrailPage";
import { ExpensesListPage } from "../ExpensesListPage";
import { InvoiceDetailPage } from "../InvoiceDetailPage";
import { PaymentDetailPage } from "../PaymentDetailPage";
import { FaultDraftsPage } from "../../maintenance/FaultDraftsPage";

const COMPANY_ID = "00000000-0000-4000-8000-000000000099";

const apiMocks = vi.hoisted(() => ({
  getInvoice: vi.fn(),
  getPayment: vi.fn(),
  getAccountingSourceLineage: vi.fn(),
  listAccountingAuditTrail: vi.fn(),
  listCoaAccountsForJe: vi.fn(),
  listExpenses: vi.fn(),
  apiRequest: vi.fn(),
}));

vi.mock("../../../contexts/CompanyContext", () => ({
  useCompanyContext: () => ({ selectedCompanyId: COMPANY_ID }),
}));

vi.mock("../../../auth/useAuth", () => ({
  useAuth: () => ({
    isLoading: false,
    isUnauthenticated: false,
    user: { id: "owner-1", role: "Owner", email: "owner@example.com" },
  }),
}));

vi.mock("../../../components/Shell", () => ({
  Shell: ({ children }: { children: ReactNode }) => <>{children}</>,
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
    getAccountingSourceLineage: apiMocks.getAccountingSourceLineage,
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

function renderManifestAt(initialEntry: string) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <MemoryRouter initialEntries={[initialEntry]}>
          <LocationProbe />
          <Routes>{ROUTES}</Routes>
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>,
  );
}

function manifestRouteElements(nodes: ReactNode): ReactElement<{ path?: string; element?: ReactNode }>[] {
  return Children.toArray(nodes).flatMap((node) => {
    if (!isValidElement<{ path?: string; element?: ReactNode; children?: ReactNode }>(node)) return [];
    if (typeof node.props.path === "string") return [node];
    return manifestRouteElements(node.props.children);
  });
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
    apiMocks.getAccountingSourceLineage.mockResolvedValue({ rows: [] });
    apiMocks.listCoaAccountsForJe.mockResolvedValue({ accounts: [] });
    apiMocks.listAccountingAuditTrail.mockResolvedValue({ events: [], next_cursor: null });
    apiMocks.listExpenses.mockResolvedValue({ rows: [], total: 0 });
    apiMocks.apiRequest.mockResolvedValue({ drafts: [] });
  });

  it("registers exactly one ProtectedRoute for every guarded accounting path", () => {
    for (const path of [
      "/accounting/invoices/:id",
      "/accounting/payments/:id",
      "/accounting/expenses/list",
      "/accounting/audit-trail",
    ]) {
      const matches = manifestRouteElements(ROUTES).filter((route) => route.props.path === path);
      expect(matches, path).toHaveLength(1);
      const protectedElement = matches[0].props.element;
      expect(isValidElement(protectedElement), `${path} element`).toBe(true);
      if (isValidElement(protectedElement)) {
        expect(
          typeof protectedElement.type === "function" ? protectedElement.type.name : "",
          `${path} wrapper`,
        ).toBe("ProtectedRoute");
      }
    }
  });

  it("renders the exact invoice customer link and navigates to the exact invoice audit URL", async () => {
    const user = userEvent.setup();
    apiMocks.getAccountingSourceLineage.mockResolvedValue({
      rows: [
        {
          posting_id: "p-1",
          journal_entry_id: "je-inv-900",
          // F-18b: memo IS the JE's human identity (accounting.journal_entries has no
          // number/ref/doc column) — without it entityLabel() honestly falls back to
          // "Journal entry — not visible" instead of ever truncating the raw uuid.
          memo: "Invoice INV-100 posting",
          posting_batch_id: null,
          source_transaction_type: "invoice",
          source_transaction_id: "inv-100",
          source_transaction_line_id: null,
          linked_object_type: null,
          linked_object_id: null,
          relationship_role: null,
          account_id: "acct-1",
          account_number: null,
          account_name: null,
          debit_or_credit: "debit",
          amount_cents: 100,
          description: null,
          occurred_at: "2026-07-01T00:00:00Z",
        },
      ],
    });
    renderAt(<InvoiceDetailPage />, "/accounting/invoices/inv-100", "/accounting/invoices/:id");

    expect(await screen.findByRole("link", { name: "Acme Freight" })).toHaveAttribute(
      "href",
      "/customers/customer-44",
    );
    expect(await screen.findByRole("link", { name: "Invoice INV-100 posting" })).toHaveAttribute(
      "href",
      "/accounting/journal-entries/je-inv-900",
    );
    const auditButton = screen.getByRole("button", { name: "View audit log" });
    expect(auditButton).toBeVisible();
    expect(auditButton).toBeEnabled();
    await user.click(auditButton);
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

  it("mounts the invoice module through real ROUTES and preserves exact click navigation", async () => {
    const user = userEvent.setup();
    renderManifestAt("/accounting/invoices/inv-100");

    expect(await screen.findByRole("link", { name: "Acme Freight" })).toHaveAttribute(
      "href",
      "/customers/customer-44",
    );
    const auditControls = await screen.findAllByRole("button", { name: "View audit log" });
    expect(auditControls).toHaveLength(1);
    const parentRowHandler = vi.fn();
    document.addEventListener("click", parentRowHandler);
    try {
      await user.click(auditControls[0]);
      await waitFor(() => {
        expect(screen.getByTestId("location")).toHaveTextContent(
          "/accounting/audit-trail?source_type=invoice&source_id=inv-100",
        );
      });
    } finally {
      document.removeEventListener("click", parentRowHandler);
    }
    expect(parentRowHandler).not.toHaveBeenCalled();
  });

  it("mounts the payment module through real ROUTES and preserves exact click navigation", async () => {
    const user = userEvent.setup();
    renderManifestAt("/accounting/payments/pay-200");

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

  it("mounts the real audit module through ROUTES and consumes the exact query parameters", async () => {
    renderManifestAt(
      "/accounting/audit-trail?source_type=customer_payment&source_id=pay-route-901",
    );

    await waitFor(() => {
      expect(apiMocks.listAccountingAuditTrail).toHaveBeenCalledWith(
        COMPANY_ID,
        expect.objectContaining({
          source_transaction_type: "customer_payment",
          source_transaction_id: "pay-route-901",
        }),
      );
    });
  });

  it("keeps the exact audit route when Source lineage is clicked inside a row", async () => {
    const user = userEvent.setup();
    apiMocks.listAccountingAuditTrail.mockResolvedValue({
      events: [{
        id: "audit-row-1",
        occurred_at: "2026-07-05T12:00:00.000Z",
        event_class: "accounting.posting_line_created",
        operating_company_id: COMPANY_ID,
        journal_entry_id: "je-1",
        posting_batch_id: null,
        source_transaction_type: "invoice",
        source_transaction_id: "inv-row-777",
        source_transaction_line_id: null,
        account_id: "acct-1",
        account_number: "1100",
        account_name: "Accounts Receivable",
        debit_or_credit: "debit",
        amount_cents: 12_500,
        description: "Invoice posting",
        before_state_json: null,
        after_state_json: { posted: true },
      }],
      next_cursor: null,
    });
    renderManifestAt(
      "/accounting/audit-trail?source_type=invoice&source_id=inv-row-777",
    );

    const lineageButton = await screen.findByRole("button", { name: "Source lineage" });
    const competingRowNavigation = vi.fn();
    document.addEventListener("click", competingRowNavigation);
    await user.click(lineageButton);
    document.removeEventListener("click", competingRowNavigation);

    expect(screen.getByTestId("location")).toHaveTextContent(
      "/accounting/audit-trail?source_type=invoice&source_id=inv-row-777",
    );
    expect(competingRowNavigation).not.toHaveBeenCalled();
    expect(apiMocks.getAccountingSourceLineage).toHaveBeenCalledWith(
      COMPANY_ID,
      {
        source_transaction_type: "invoice",
        source_transaction_id: "inv-row-777",
      },
    );
    expect(await screen.findByText(/Source lineage: invoice/)).toBeInTheDocument();
    expect(screen.queryByText("Before state")).not.toBeInTheDocument();
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
      "/accounting/expenses/expense-300",
    );
    expect(screen.getByText(/Deep-link expense/)).toHaveTextContent("highlighted in the list below");
  });

  it("mounts the expense module through real ROUTES and consumes the exact expense ID", async () => {
    apiMocks.listExpenses.mockResolvedValue({
      rows: [{
        id: "expense-route-301",
        expense_number: "EXP-301",
        transaction_date: "2026-07-04",
        status: "posted",
        total_amount_cents: 6100,
        is_reconciled: false,
      }],
      total: 1,
    });
    renderManifestAt("/accounting/expenses/list?expense_id=expense-route-301");

    expect(await screen.findByRole("link", { name: "EXP-301" })).toHaveAttribute(
      "href",
      "/accounting/expenses/expense-route-301",
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

    // "UNIT-A" now renders twice — once in the "Filtered to unit" banner, once in the table
    // row's EntityLinkOrTombstone — both are the same honest drill-through, so assert at least
    // one resolves to the real unit route rather than picking a single (now ambiguous) match.
    const unitALinks = await screen.findAllByRole("link", { name: "UNIT-A" });
    expect(unitALinks.length).toBeGreaterThanOrEqual(1);
    for (const link of unitALinks) {
      expect(link).toHaveAttribute("href", "/fleet/units/unit-a");
    }
    expect(screen.queryByRole("link", { name: "UNIT-B" })).not.toBeInTheDocument();
    expect(screen.getByTestId("fault-drafts-unit-reverse-banner")).toHaveTextContent(
      /Showing fault-driven drafts for the selected unit/,
    );
  });
});
