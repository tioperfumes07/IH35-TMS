import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactElement } from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../api/client";
import * as vendorsApi from "../api/vendors";
import * as accountingApi from "../api/accounting";
import * as bankingApi from "../api/banking";
import * as mdataApi from "../api/mdata";
import { VendorDetailPage } from "./VendorDetail";
import { ToastProvider } from "../components/Toast";

vi.mock("../auth/useAuth", () => ({
  useAuth: () => ({
    user: { role: "Owner", uuid: "81111181-1111-4111-8111-111111111111" },
  }),
}));

vi.mock("../contexts/CompanyContext", () => ({
  useCompanyContext: () => ({ selectedCompanyId: "91f6d7d8-0f3a-4c2d-8e1b-2c3d4e5f6071" }),
}));

vi.mock("../api/mdata", () => ({
  getVendor: vi.fn(),
  updateVendor: vi.fn(),
  listPaymentTermOptions: vi.fn().mockResolvedValue({ payment_terms: [] }),
}));

vi.mock("../api/catalog-accounts", () => ({
  listCatalogAccounts: vi.fn().mockResolvedValue({ accounts: [] }),
}));

vi.mock("../api/accounting", () => ({
  listVendorBills: vi.fn(),
}));

vi.mock("../api/vendors", () => ({
  listVendorBillPayments: vi.fn(),
  recordVendorBillPayment: vi.fn(),
}));

vi.mock("../api/banking", () => ({
  getAllAccounts: vi.fn(),
}));

function wrap(ui: ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={["/vendors/v1?tab=ap"]}>
        <ToastProvider>
          <Routes>
            <Route path="/vendors/:id" element={ui} />
          </Routes>
        </ToastProvider>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("VendorDetail bill payment", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(mdataApi.getVendor).mockResolvedValue({
      id: "v1",
      name: "Parts Co",
      vendor_type: "vendor",
      deactivated_at: null,
    } as never);
    vi.mocked(accountingApi.listVendorBills).mockResolvedValue({
      rows: [
        {
          id: "bill-1",
          bill_number: "B-1",
          bill_date: "2026-04-01",
          due_date: "2026-05-01",
          amount_cents: 5000,
          paid_cents: 0,
          balance_cents: 5000,
          status: "open",
        } as never,
      ],
    });
    vi.mocked(vendorsApi.listVendorBillPayments).mockResolvedValue({ payments: [], rows: [] });
    vi.mocked(bankingApi.getAllAccounts).mockResolvedValue({
      accounts: [{ id: "bank-1", display_name: "Ops Checking" }],
    } as never);
    vi.mocked(vendorsApi.recordVendorBillPayment).mockResolvedValue({ ok: true, id: "pay-1" });
  });

  it("shows Record Bill Payment on AP tab", async () => {
    render(wrap(<VendorDetailPage />));
    await waitFor(() => expect(screen.getByText("Record Bill Payment")).toBeInTheDocument());
  });

  it("shows backend pending when payments API 404", async () => {
    vi.mocked(vendorsApi.listVendorBillPayments).mockRejectedValue(new ApiError(404, {}));
    render(wrap(<VendorDetailPage />));
    await waitFor(() => expect(screen.getByText(/Backend pending/i)).toBeInTheDocument());
  });

  // VEND-F-VENDORDETAIL-PAYMENT-NEVER-SENDS-BANK-ACCOUNT
  it("sends the selected bank_account_id on submit for a method that needs one", async () => {
    const user = userEvent.setup();
    render(wrap(<VendorDetailPage />));
    await user.click(await screen.findByText("Record Bill Payment"));
    await waitFor(() => expect(screen.getByLabelText(/Payment amount/i)).toBeInTheDocument());

    await user.type(screen.getByLabelText(/Payment amount/i), "50");
    // default method is ACH -> needsBankAccount -> account auto-selects the only option
    await waitFor(() => expect(screen.getByDisplayValue("Ops Checking")).toBeInTheDocument());

    const submit = screen.getByRole("button", { name: /Record payment/i });
    await waitFor(() => expect(submit).toBeEnabled());
    await user.click(submit);

    await waitFor(() =>
      expect(vendorsApi.recordVendorBillPayment).toHaveBeenCalledWith(
        "v1",
        expect.objectContaining({ bank_account_id: "bank-1" })
      )
    );
  });

  it("keeps submit disabled when no bank account is available for a method that needs one", async () => {
    vi.mocked(bankingApi.getAllAccounts).mockResolvedValue({ accounts: [] } as never);
    const user = userEvent.setup();
    render(wrap(<VendorDetailPage />));
    await user.click(await screen.findByText("Record Bill Payment"));
    await user.type(screen.getByLabelText(/Payment amount/i), "50");

    const submit = screen.getByRole("button", { name: /Record payment/i });
    await waitFor(() => expect(submit).toBeDisabled());
    expect(vendorsApi.recordVendorBillPayment).not.toHaveBeenCalled();
  });
});
