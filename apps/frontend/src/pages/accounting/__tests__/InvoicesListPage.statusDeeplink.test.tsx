import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import type { ReactElement } from "react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as accountingApi from "../../../api/accounting";
import * as mdataApi from "../../../api/mdata";
import { ToastProvider } from "../../../components/Toast";
import { InvoicesListPage } from "../InvoicesListPage";

const COMPANY_ID = "00000000-0000-4000-8000-000000000099";
const CUSTOMER_ID = "11111111-1111-4111-8111-111111111111";

vi.mock("../../../contexts/CompanyContext", () => ({
  useCompanyContext: () => ({ selectedCompanyId: COMPANY_ID }),
}));

vi.mock("../AccountingSubNavWrapper", () => ({
  AccountingSubNavWrapper: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock("../../../components/shared/EntityLink", () => ({
  EntityLink: ({ label }: { label: string }) => <span>{label}</span>,
}));

function wrap(ui: ReactElement, initialEntry: string) {
  return (
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <ToastProvider>
        <MemoryRouter initialEntries={[initialEntry]}>{ui}</MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>
  );
}

function invoice(partial: Record<string, unknown>) {
  return {
    id: "inv-1",
    operating_company_id: COMPANY_ID,
    customer_id: CUSTOMER_ID,
    customer_name: "Acme Freight",
    display_id: "INV-1",
    status: "sent",
    source_load_id: null,
    issue_date: "2026-07-01",
    due_date: "2026-07-31",
    sent_at: "2026-07-01T00:00:00.000Z",
    voided_at: null,
    void_reason: null,
    subtotal_cents: 12_500,
    tax_cents: 0,
    total_cents: 12_500,
    amount_paid_cents: 0,
    amount_open_cents: 12_500,
    payment_terms_label: null,
    payment_terms_days: null,
    internal_notes: null,
    customer_notes: null,
    created_at: "2026-07-01T00:00:00.000Z",
    updated_at: "2026-07-01T00:00:00.000Z",
    ...partial,
  };
}

describe("InvoicesListPage status deep-link (A/R aging contract)", () => {
  beforeEach(() => {
    vi.spyOn(mdataApi, "listCustomers").mockResolvedValue({ customers: [] } as never);
    vi.spyOn(accountingApi, "listInvoices").mockResolvedValue({
      invoices: [
        invoice({ id: "inv-open", display_id: "INV-1", status: "sent", amount_open_cents: 12_500 }),
        invoice({
          id: "inv-paid",
          display_id: "INV-2",
          status: "paid",
          amount_open_cents: 0,
          amount_paid_cents: 9_999,
          total_cents: 9_999,
          subtotal_cents: 9_999,
        }),
      ],
    } as never);
  });

  it("honors ?customer_id=&status=with_balance without inventing params", async () => {
    render(
      wrap(
        <InvoicesListPage />,
        `/accounting/invoices?customer_id=${CUSTOMER_ID}&status=with_balance`
      )
    );

    await waitFor(() => {
      expect(accountingApi.listInvoices).toHaveBeenCalledWith(
        COMPANY_ID,
        expect.objectContaining({
          customer_id: CUSTOMER_ID,
          // with_balance is client-side — must NOT be sent as a backend status
          status: undefined,
        })
      );
    });

    // Combobox input value reflects the deep-linked aging context.
    expect(await screen.findByDisplayValue("With balance")).toBeInTheDocument();

    await waitFor(() => expect(screen.getByText("INV-1")).toBeInTheDocument());
    expect(screen.queryByText("INV-2")).not.toBeInTheDocument();
  });
});
