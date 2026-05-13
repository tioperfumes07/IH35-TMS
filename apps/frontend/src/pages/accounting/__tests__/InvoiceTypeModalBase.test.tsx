import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactElement } from "react";
import { describe, expect, it, vi } from "vitest";
import { ToastProvider } from "../../../components/Toast";
import { InvoiceTypeModalBase } from "../../accounting/modals/InvoiceTypeModalBase";

const searchMock = vi.fn();

vi.mock("../../../api/qbo-mdata", () => ({
  searchQboMasterData: (...args: unknown[]) => searchMock(...args),
}));

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
    searchMock.mockResolvedValue({ results: [] });
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

  it("after QBO pick, Create sends customer_id UUID", async () => {
    const user = userEvent.setup();
    searchMock.mockResolvedValue({
      results: [
        {
          id: "71111111-1111-4111-8111-111111111111",
          qbo_id: "qb-99",
          display_name: "Invoice Customer LLC",
          active: true,
        },
      ],
    });

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

    const custInput = screen.getByPlaceholderText(/Select QBO customer/i);
    await user.click(custInput);
    await user.type(custInput, "Inv");
    await waitFor(() => expect(searchMock).toHaveBeenCalled(), { timeout: 4000 });

    const option = await screen.findByRole("button", { name: /Invoice Customer LLC/i });
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
});
