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

vi.mock("../api/client", () => ({
  apiRequest: vi.fn().mockResolvedValue({
    vendor: { id: "v1", name: "Parts Co" },
    suggested_category: null,
    saved_category_account: null,
    ap_aging: { value: { current_cents: 0, d1_30_cents: 0, d31_60_cents: 0, d61_90_cents: 0, d90_plus_cents: 0, total_open_cents: 0, overdue_cents: 0, open_bill_count: 0 }, empty_reason: null },
    open_bills: { value: [], empty_reason: null },
    form_1099: { value: { tax_year: 2026, eligible_1099: false, has_tax_id: false, paid_ytd_cents: 0, bill_payments_ytd_cents: 0, expenses_ytd_cents: 0, threshold_cents: 60000, reportable: false, missing_tax_id: false, review_eligibility: false }, empty_reason: null },
    insurance_authority: { value: { policies: [], authority: { mc_number: null, dot_number: null, safer_status: null, authority_status: null, out_of_service: null, verified_at: null } }, empty_reason: null },
    work_orders: { value: [], empty_reason: null },
    fuel: { value: { txns_90d: 0, gallons_90d: 0, total_cents_90d: 0, last_at: null, recent: [] }, empty_reason: null },
    lanes: { value: [], empty_reason: null },
    terms: { value: { terms_name: null, days_until_due: null, early_payment_discount_pct: null, early_payment_discount_days: null, default_expense_account: null }, empty_reason: null },
    history: { value: [], empty_reason: null },
  }),
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
    const notice = await screen.findByTestId("vendor-record-bill-payment-disabled");
    expect(notice).toBeInTheDocument();
    expect(notice.textContent).toMatch(/Bills and A\/P on this vendor profile are read only/i);
    expect(screen.queryByRole("button", { name: /Record payment/i })).not.toBeInTheDocument();
  });

  it("still lists bills read-only", async () => {
    render(wrap(<VendorDetailPage />));
    await waitFor(() => expect(screen.getByText("B-1")).toBeInTheDocument());
  });
});
