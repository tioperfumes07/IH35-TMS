import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import type { ReactElement } from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "../../../components/Toast";
import { InvoiceDetailPage } from "../InvoiceDetailPage";

const getInvoiceMock = vi.fn();

vi.mock("../../../api/accounting", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../api/accounting")>();
  return {
    ...actual,
    getInvoice: (...args: unknown[]) => getInvoiceMock(...args),
  };
});

vi.mock("../../../contexts/CompanyContext", () => ({
  useCompanyContext: () => ({ selectedCompanyId: "91f6d7d8-0f3a-4c2d-8e1b-2c3d4e5f6071" }),
}));

vi.mock("../AccountingSubNavWrapper", () => ({
  AccountingSubNavWrapper: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("../../../components/shared/EntityLink", () => ({
  EntityLink: ({ label }: { label: string }) => <span>{label}</span>,
}));

function baseInvoice(paymentApplications: unknown[]) {
  return {
    id: "inv-200",
    display_id: "INV-200",
    customer_id: "customer-44",
    customer_name: "Acme Freight",
    status: "partial",
    issue_date: "2026-07-01",
    due_date: "2026-07-31",
    source_load_id: null,
    subtotal_cents: 50_000,
    tax_cents: 0,
    total_cents: 50_000,
    amount_open_cents: 0,
    amount_paid_cents: 50_000,
    internal_notes: null,
    customer_notes: null,
    lines: [
      {
        id: "line-1",
        line_type: "linehaul",
        description: "Linehaul",
        quantity: 1,
        unit_amount_cents: 50_000,
        line_total_cents: 50_000,
      },
    ],
    payment_applications: paymentApplications,
    factoring_advance_id: null,
  };
}

function wrap(ui: ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <MemoryRouter initialEntries={["/accounting/invoices/inv-200"]}>
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          <Routes>
            <Route path="/accounting/invoices/:id" element={ui} />
          </Routes>
        </ToastProvider>
      </QueryClientProvider>
    </MemoryRouter>
  );
}

describe("InvoiceDetailPage — A5 item 3, Payment Applications split Paid from Deposited", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows 'Not yet deposited' for a payment recorded as paid but with no cleared_date", async () => {
    getInvoiceMock.mockResolvedValue(
      baseInvoice([
        {
          id: "app-1",
          payment_id: "pay-1",
          amount_cents: 50_000,
          applied_at: "2026-07-15T10:00:00Z",
          payment_display_id: "PMT-0001",
          payment_date: "2026-07-15",
          cleared_date: null,
          deposited_to_account_name: null,
        },
      ])
    );

    render(wrap(<InvoiceDetailPage />));

    expect(await screen.findByText(/Not yet deposited/)).toBeInTheDocument();
    expect(screen.queryByText(/^Deposited /)).not.toBeInTheDocument();
  });

  it("shows the Deposited date + account once cleared_date is set — Paid text stays unchanged", async () => {
    getInvoiceMock.mockResolvedValue(
      baseInvoice([
        {
          id: "app-2",
          payment_id: "pay-2",
          amount_cents: 50_000,
          applied_at: "2026-07-15T10:00:00Z",
          payment_display_id: "PMT-0002",
          payment_date: "2026-07-15",
          cleared_date: "2026-07-18",
          deposited_to_account_name: "Operating Checking",
        },
      ])
    );

    render(wrap(<InvoiceDetailPage />));

    expect(await screen.findByText(/Deposited 07\/18\/2026 to Operating Checking/)).toBeInTheDocument();
    expect(screen.queryByText(/Not yet deposited/)).not.toBeInTheDocument();
    // Paid (applied_at) rendering is unchanged by this feature.
    expect(screen.getByText(/Paid/)).toBeInTheDocument();
  });

  it("omits the account name when cleared but deposited_to_account_name is unavailable", async () => {
    getInvoiceMock.mockResolvedValue(
      baseInvoice([
        {
          id: "app-3",
          payment_id: "pay-3",
          amount_cents: 50_000,
          applied_at: "2026-07-15T10:00:00Z",
          payment_display_id: "PMT-0003",
          payment_date: "2026-07-15",
          cleared_date: "2026-07-18",
          deposited_to_account_name: null,
        },
      ])
    );

    render(wrap(<InvoiceDetailPage />));

    const deposited = await screen.findByText(/^Deposited 07\/18\/2026$/);
    expect(deposited).toBeInTheDocument();
  });
});
