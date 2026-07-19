import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactElement } from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { ToastProvider } from "../../../components/Toast";
import { PaymentDetailPage } from "../PaymentDetailPage";

const getPaymentMock = vi.fn();
const unapplyPaymentMock = vi.fn();

vi.mock("../../../api/accounting", () => ({
  getPayment: (...args: unknown[]) => getPaymentMock(...args),
  listInvoices: vi.fn().mockResolvedValue({ invoices: [] }),
  applyPayment: vi.fn(),
  unapplyPayment: (...args: unknown[]) => unapplyPaymentMock(...args),
  voidPayment: vi.fn(),
}));

vi.mock("../../../contexts/CompanyContext", () => ({
  useCompanyContext: () => ({ selectedCompanyId: "91f6d7d8-0f3a-4c2d-8e1b-2c3d4e5f6071" }),
}));

vi.mock("../AccountingSubNavWrapper", () => ({
  AccountingSubNavWrapper: ({ children }: { children: ReactElement }) => <>{children}</>,
}));

function wrap(ui: ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return (
    <MemoryRouter initialEntries={["/accounting/payments/pay-200"]}>
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          <Routes>
            <Route path="/accounting/payments/:id" element={ui} />
          </Routes>
        </ToastProvider>
      </QueryClientProvider>
    </MemoryRouter>
  );
}

describe("PaymentDetailPage mutation error handling", () => {
  it("surfaces a toast instead of failing silently when unapplyPayment rejects", async () => {
    getPaymentMock.mockResolvedValue({
      id: "pay-200",
      display_id: "PAY-200",
      customer_id: "customer-44",
      customer_name: "Acme Freight",
      payment_date: "2026-07-02",
      payment_method: "check",
      reference: "CHK-9",
      amount_cents: 10_000,
      amount_applied_cents: 5_000,
      amount_unapplied_cents: 5_000,
      deposited_to_account_id: null,
      applications: [
        {
          id: "app-1",
          invoice_id: "inv-100",
          invoice_display_id: "INV-100",
          invoice_amount_open_cents: 0,
          amount_cents: 5_000,
          applied_at: "2026-07-02T12:00:00.000Z",
        },
      ],
      notes: null,
      voided_at: null,
    });
    unapplyPaymentMock.mockRejectedValue(new Error("Cannot unapply — invoice is locked"));

    render(wrap(<PaymentDetailPage />));

    const unapplyButton = await screen.findByRole("button", { name: "Unapply" });
    fireEvent.click(unapplyButton);

    await waitFor(() => expect(unapplyPaymentMock).toHaveBeenCalledOnce());
    await waitFor(() =>
      expect(screen.getByTestId("toast-message")).toHaveTextContent("Cannot unapply — invoice is locked"),
    );
  });
});
