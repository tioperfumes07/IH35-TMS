import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactElement } from "react";
import { describe, expect, it, vi } from "vitest";
import { listCustomers } from "../../../api/mdata";
import { ToastProvider } from "../../../components/Toast";
import { InvoiceTypeModalBase } from "../../accounting/modals/InvoiceTypeModalBase";

vi.mock("../../../api/mdata", () => ({
  listCustomers: vi.fn(),
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
    vi.mocked(listCustomers).mockResolvedValue({ customers: [{ id: "c1", name: "C1", customer_code: "X", customer_type: "broker", status: "active", quality_overall_flag: "standard", quality_disputes_count: 0 }] } as never);
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
});
