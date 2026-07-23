import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactElement } from "react";
import { describe, expect, it, vi } from "vitest";
import { ToastProvider } from "../../../components/Toast";
import { InvoiceTypeModalBase } from "../../accounting/modals/InvoiceTypeModalBase";

const listCustomersMock = vi.fn();
const listLoadsMock = vi.fn();
const getCoaAccountsMock = vi.fn();
const addInvoiceLineMock = vi.fn();
const patchInvoiceMock = vi.fn();

vi.mock("../../../api/mdata", () => ({
  listCustomers: (...args: unknown[]) => listCustomersMock(...args),
}));

vi.mock("../../../api/loads", () => ({
  listLoads: (...args: unknown[]) => listLoadsMock(...args),
}));

vi.mock("../../../api/banking", () => ({
  getCoaAccounts: (...args: unknown[]) => getCoaAccountsMock(...args),
}));

vi.mock("../../../api/accounting", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../api/accounting")>();
  return {
    ...actual,
    addInvoiceLine: (...args: unknown[]) => addInvoiceLineMock(...args),
    patchInvoice: (...args: unknown[]) => patchInvoiceMock(...args),
  };
});

function wrap(ui: ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <ToastProvider>{ui}</ToastProvider>
    </QueryClientProvider>
  );
}

describe("InvoiceTypeModalBase validation", () => {
  it("requires customer before submit", async () => {
    const user = userEvent.setup();
    listCustomersMock.mockResolvedValue({ customers: [], total: 0 });
    listLoadsMock.mockResolvedValue({ loads: [], total_count: 0 });
    getCoaAccountsMock.mockResolvedValue({ accounts: [] });
    const createInvoice = vi.fn();
    wrap(
      <InvoiceTypeModalBase
        open
        operatingCompanyId="91f6d7d8-0f3a-4c2d-8e1b-2c3d4e5f6071"
        title="Test invoice"
        billToEntityType="customer"
        onClose={vi.fn()}
        onCreated={vi.fn()}
        createInvoice={createInvoice}
      />
    );
    await user.click(screen.getByRole("button", { name: /^Create$/i }));
    await waitFor(() => {
      expect(document.getElementById("customer_id-error")).toBeTruthy();
    });
    expect(createInvoice).not.toHaveBeenCalled();
  });

  it("after picking a TMS customer, Create sends customer_id UUID", async () => {
    const user = userEvent.setup();
    listCustomersMock.mockResolvedValue({
      customers: [
        {
          id: "71111111-1111-4111-8111-111111111111",
          name: "Invoice Customer LLC",
          email: "ar@example.com",
          phone: "555-0100",
        },
      ],
      total: 1,
    });
    listLoadsMock.mockResolvedValue({ loads: [], total_count: 0 });
    getCoaAccountsMock.mockResolvedValue({
      accounts: [
        {
          id: "82222222-2222-4222-8222-222222222222",
          account_name: "Sales of Service Income",
          account_type: "Income",
          account_number: "4000",
        },
      ],
    });
    patchInvoiceMock.mockResolvedValue({});
    addInvoiceLineMock.mockResolvedValue({ line: { id: "line-1" } });

    const createInvoice = vi.fn().mockResolvedValue({ id: "inv-1" });
    wrap(
      <InvoiceTypeModalBase
        open
        operatingCompanyId="91f6d7d8-0f3a-4c2d-8e1b-2c3d4e5f6071"
        title="Test invoice"
        billToEntityType="customer"
        onClose={vi.fn()}
        onCreated={vi.fn()}
        createInvoice={createInvoice}
      />
    );

    const custInput = screen.getByPlaceholderText(/Search customers…/i);
    await user.click(custInput);
    await waitFor(() => expect(listCustomersMock).toHaveBeenCalled(), { timeout: 4000 });

    const option = await screen.findByRole("option", { name: /Invoice Customer LLC/i });
    await user.click(option);

    await user.click(screen.getByRole("button", { name: /^Create$/i }));

    await waitFor(() => {
      expect(createInvoice).toHaveBeenCalledWith(
        expect.objectContaining({
          customer_id: "71111111-1111-4111-8111-111111111111",
        })
      );
    });
  });

  it("renders income account ReferenceSelect with createKind account", async () => {
    listCustomersMock.mockResolvedValue({ customers: [], total: 0 });
    listLoadsMock.mockResolvedValue({ loads: [], total_count: 0 });
    getCoaAccountsMock.mockResolvedValue({
      accounts: [
        {
          id: "82222222-2222-4222-8222-222222222222",
          account_name: "Sales of Service Income",
          account_type: "Income",
        },
      ],
    });
    wrap(
      <InvoiceTypeModalBase
        open
        operatingCompanyId="91f6d7d8-0f3a-4c2d-8e1b-2c3d4e5f6071"
        title="Test invoice"
        billToEntityType="customer"
        onClose={vi.fn()}
        onCreated={vi.fn()}
        createInvoice={vi.fn()}
      />
    );
    expect(await screen.findByPlaceholderText(/Select income account/i)).toBeTruthy();
  });
});
