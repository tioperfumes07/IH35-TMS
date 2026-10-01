import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import type { ReactElement } from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as vendorsApi from "../api/vendors";
import * as accountingApi from "../api/accounting";
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
  listExpenses: vi.fn().mockResolvedValue({ rows: [] }),
}));

vi.mock("../api/vendors", () => ({
  listVendorBillPayments: vi.fn(),
}));

vi.mock("../api/vendor-credits", () => ({
  listVendorCredits: vi.fn().mockResolvedValue({ credits: [] }),
}));

vi.mock("../api/maintenance", () => ({
  getVendorIntegrityHistory: vi.fn().mockResolvedValue({ findings: [] }),
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

describe("VendorDetail A/P read-only (ORDERS §4)", () => {
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
  });

  it("disables Record Bill Payment on vendor profile (A/P read only)", async () => {
    render(wrap(<VendorDetailPage />));
    await waitFor(() => expect(screen.getByTestId("vendor-record-bill-payment-disabled")).toBeInTheDocument());
    expect(screen.getByText(/Bills and A\/P on this vendor profile are read only/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Record payment/i })).not.toBeInTheDocument();
  });

  it("still lists bills read-only", async () => {
    render(wrap(<VendorDetailPage />));
    await waitFor(() => expect(screen.getByText("B-1")).toBeInTheDocument());
  });
});
