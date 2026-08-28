import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactElement } from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../api/client";
import * as customersApi from "../api/customers";
import * as accountingApi from "../api/accounting";
import * as mdataApi from "../api/mdata";
import * as forecastApi from "../api/forecast";
import { ToastProvider } from "../components/Toast";
import { CustomerDetailPage } from "./CustomerDetail";

vi.mock("../auth/useAuth", () => ({
  useAuth: () => ({
    user: { role: "Owner", uuid: "81111181-1111-4111-8111-111111111111" },
    session: null,
    isLoading: false,
    isUnauthenticated: false,
    refetch: vi.fn(),
  }),
}));

vi.mock("../api/mdata", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../api/mdata")>();
  return {
    ...actual,
    getCustomerDetail: vi.fn(),
    getCustomerBillingSummary: vi.fn(),
    getCustomerFinancialSummary: vi.fn(),
    getCustomerRelationshipScore: vi.fn(),
    listCustomers: vi.fn(),
    listCustomerLanes: vi.fn().mockResolvedValue({ lanes: [] }),
    listCustomerContacts: vi.fn().mockResolvedValue({ contacts: [] }),
    listVendors: vi.fn().mockResolvedValue({ vendors: [] }),
    listCustomerQualityEvents: vi.fn().mockResolvedValue({ events: [] }),
    listPaymentTermOptions: vi.fn(),
    updateCustomer: vi.fn(),
  };
});

vi.mock("../api/accounting", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../api/accounting")>();
  return {
    ...actual,
    listInvoices: vi.fn(),
  };
});

// CashForecastReverseSection (rendered on the billing tab) calls this directly — without a mock
// the global fetch stub in test-setup.ts resolves `[]`, and `[].entries` resolves to the Array
// prototype's own `.entries` METHOD (not undefined), so `?? []` never kicks in and the component
// crashes calling `.slice` on a function.
vi.mock("../api/forecast", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../api/forecast")>();
  return {
    ...actual,
    listForecastEntries: vi.fn(),
  };
});

vi.mock("../api/customers", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../api/customers")>();
  return {
    ...actual,
    listCustomerPayments: vi.fn(),
    // CustomerDetail.tsx's query calls listAllCustomerPayments, not listCustomerPayments directly --
    // this module's REAL listAllCustomerPayments closes over its OWN internal reference to
    // listCustomerPayments, which vi.mock's per-export override below does not redirect (a real
    // ESM/vitest live-binding gap, not something spreading `actual` fixes), so it needs its own
    // mock rather than composing through the mocked listCustomerPayments.
    listAllCustomerPayments: vi.fn(),
    recordCustomerPayment: vi.fn(),
    unapplyCustomerPaymentApplication: vi.fn(),
  };
});

vi.mock("../api/catalogs", () => ({
  listUsStates: vi.fn().mockResolvedValue({ states: [] }),
}));

vi.mock("../api/fmcsa", () => ({
  listFmcsaLookups: vi.fn().mockResolvedValue({ lookups: [] }),
}));

vi.mock("../components/customers/FreeTimeDetentionEditor", () => ({
  FreeTimeDetentionEditor: () => null,
}));

// CustomerDetail reads useCompanyContext, which THROWS outside CompanyProvider
// ("useCompanyContext must be used within CompanyProvider") — the render died before any assertion, so both
// cases failed as missing UI rather than as a missing provider. Same shape/values as the established mock in
// WorkOrderDetailPage.test.tsx.
vi.mock("./../contexts/CompanyContext", () => ({
  useCompanyContext: () => ({
    selectedCompanyId: "test-operating-co",
    companies: [],
    selectedCompany: null,
    isLoading: false,
    setSelectedCompany: vi.fn(),
    setDefaultCompanyForUser: vi.fn(async () => {}),
  }),
}));

function wrap(ui: ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={["/customers/c1?tab=billing"]}>
        <ToastProvider>
          <Routes>
            <Route path="/customers/:id" element={ui} />
          </Routes>
        </ToastProvider>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("CustomerDetail cash application", () => {
  beforeEach(() => {
    vi.mocked(mdataApi.getCustomerDetail).mockResolvedValue({
      customer: {
        id: "c1",
        operating_company_id: "co-1",
        name: "Acme",
        status: "active",
        quality_overall_flag: "standard",
        contacts: [],
      },
    } as never);
    vi.mocked(mdataApi.getCustomerBillingSummary).mockResolvedValue({
      outstanding_balance_cents: 0,
      aging_buckets: { total_open: 0, open_invoice_count: 0 },
    } as never);
    vi.mocked(mdataApi.getCustomerFinancialSummary).mockRejectedValue(new Error("not needed"));
    vi.mocked(mdataApi.getCustomerRelationshipScore).mockRejectedValue(new Error("not needed"));
    vi.mocked(mdataApi.listCustomers).mockResolvedValue({ customers: [], total: 0 } as never);
    vi.mocked(accountingApi.listInvoices).mockResolvedValue({
      invoices: [
        {
          id: "inv-1",
          display_id: "INV-1",
          status: "sent",
          issue_date: "2026-04-01",
          amount_open_cents: 3000,
          total_cents: 3000,
          amount_paid_cents: 0,
        } as never,
      ],
    });
    vi.mocked(customersApi.listCustomerPayments).mockResolvedValue({ rows: [], total: 0 });
    vi.mocked(customersApi.listAllCustomerPayments).mockResolvedValue({ rows: [], total: 0 });
    vi.mocked(customersApi.recordCustomerPayment).mockResolvedValue({ ok: true });
    vi.mocked(forecastApi.listForecastEntries).mockResolvedValue({ entries: [] });
    vi.mocked(mdataApi.listPaymentTermOptions).mockResolvedValue({
      payment_terms: [{ id: "84532954-6f73-4445-bb09-7f53a1b43c75", terms_name: "Net 30", days_until_due: 30 }],
    } as never);
    vi.mocked(mdataApi.updateCustomer).mockResolvedValue({ id: "c1" } as never);
  });

  it("shows Record Payment section on billing tab", async () => {
    render(wrap(<CustomerDetailPage />));
    await waitFor(() => expect(screen.getByText("Record Payment")).toBeInTheDocument());
  });

  it("shows backend pending when listCustomerPayments 404", async () => {
    vi.mocked(customersApi.listAllCustomerPayments).mockRejectedValue(new ApiError(404, {}));
    render(wrap(<CustomerDetailPage />));
    await waitFor(() => expect(screen.getByText(/Backend pending/i)).toBeInTheDocument());
  });

  it("preserves the hydrated customer when payment terms is the first edit", async () => {
    const user = userEvent.setup();
    render(wrap(<CustomerDetailPage />));

    await user.click(await screen.findByRole("button", { name: /^Edit$/ }));
    await user.click(screen.getByRole("button", { name: /^Profile$/ }));
    await user.click(screen.getByPlaceholderText("Select terms"));
    await user.click(screen.getByRole("option", { name: "Net 30 (30d)" }));
    await user.click(screen.getByRole("button", { name: /^Save$/ }));

    await waitFor(() => expect(mdataApi.updateCustomer).toHaveBeenCalled());
    expect(vi.mocked(mdataApi.updateCustomer).mock.calls[0]?.[1]).toMatchObject({
      name: "Acme",
      status: "active",
      quality_overall_flag: "standard",
      free_time_pickup_minutes: 120,
      free_time_delivery_minutes: 120,
      payment_terms_id: "84532954-6f73-4445-bb09-7f53a1b43c75",
    });
  });
});
