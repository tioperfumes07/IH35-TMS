import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactElement } from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "../../../components/Toast";
import { InvoiceDetailPage } from "../InvoiceDetailPage";

const getInvoiceMock = vi.fn();
const sendInvoiceMock = vi.fn();
const voidInvoiceMock = vi.fn();
const addInvoiceLineMock = vi.fn();
const patchInvoiceLineMock = vi.fn();
const deleteInvoiceLineMock = vi.fn();

vi.mock("../../../api/accounting", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../api/accounting")>();
  return {
    ...actual,
    getInvoice: (...args: unknown[]) => getInvoiceMock(...args),
    sendInvoice: (...args: unknown[]) => sendInvoiceMock(...args),
    voidInvoice: (...args: unknown[]) => voidInvoiceMock(...args),
    addInvoiceLine: (...args: unknown[]) => addInvoiceLineMock(...args),
    patchInvoiceLine: (...args: unknown[]) => patchInvoiceLineMock(...args),
    deleteInvoiceLine: (...args: unknown[]) => deleteInvoiceLineMock(...args),
  };
});

vi.mock("../../../contexts/CompanyContext", () => ({
  useCompanyContext: () => ({ selectedCompanyId: "91f6d7d8-0f3a-4c2d-8e1b-2c3d4e5f6071" }),
}));

vi.mock("../AccountingSubNavWrapper", () => ({
  AccountingSubNavWrapper: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

function draftInvoice() {
  return {
    id: "inv-100",
    display_id: "INV-100",
    customer_id: "customer-44",
    customer_name: "Acme Freight",
    status: "draft",
    issue_date: "2026-07-01",
    due_date: "2026-07-31",
    source_load_id: null,
    subtotal_cents: 12_500,
    tax_cents: 0,
    total_cents: 12_500,
    amount_open_cents: 12_500,
    internal_notes: null,
    customer_notes: null,
    lines: [
      {
        id: "line-1",
        line_type: "linehaul",
        description: "Linehaul",
        quantity: 1,
        unit_amount_cents: 12_500,
        line_total_cents: 12_500,
      },
    ],
    payment_applications: [],
    factoring_advance_id: null,
  };
}

function wrap(ui: ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return (
    <MemoryRouter initialEntries={["/accounting/invoices/inv-100"]}>
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

describe("InvoiceDetailPage mutation error handling", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getInvoiceMock.mockResolvedValue(draftInvoice());
  });

  it("surfaces a toast instead of failing silently when sendInvoice rejects", async () => {
    sendInvoiceMock.mockRejectedValue(new Error("Period is closed — cannot send invoice"));

    render(wrap(<InvoiceDetailPage />));

    const sendButton = await screen.findByRole("button", { name: "Send" });
    fireEvent.click(sendButton);

    await waitFor(() => expect(sendInvoiceMock).toHaveBeenCalledOnce());
    await waitFor(() =>
      expect(screen.getByTestId("toast-message")).toHaveTextContent("Period is closed — cannot send invoice")
    );
  });
});
