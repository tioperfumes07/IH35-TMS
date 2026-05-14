import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import type { ReactElement } from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../api/client";
import * as customersApi from "../api/customers";
import * as accountingApi from "../api/accounting";
import * as mdataApi from "../api/mdata";
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
    listCustomerLanes: vi.fn().mockResolvedValue({ lanes: [] }),
    listCustomerContacts: vi.fn().mockResolvedValue({ contacts: [] }),
    listVendors: vi.fn().mockResolvedValue({ vendors: [] }),
    listCustomerQualityEvents: vi.fn().mockResolvedValue({ events: [] }),
  };
});

vi.mock("../api/accounting", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../api/accounting")>();
  return {
    ...actual,
    listInvoices: vi.fn(),
  };
});

vi.mock("../api/customers", () => ({
  listCustomerPayments: vi.fn(),
  recordCustomerPayment: vi.fn(),
  unapplyCustomerPayment: vi.fn(),
}));

vi.mock("../api/catalogs", () => ({
  listUsStates: vi.fn().mockResolvedValue({ states: [] }),
}));

vi.mock("../api/fmcsa", () => ({
  listFmcsaLookups: vi.fn().mockResolvedValue({ lookups: [] }),
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
    vi.mocked(customersApi.listCustomerPayments).mockResolvedValue({ payments: [] });
    vi.mocked(customersApi.recordCustomerPayment).mockResolvedValue({ ok: true });
  });

  it("shows Record Payment section on billing tab", async () => {
    render(wrap(<CustomerDetailPage />));
    await waitFor(() => expect(screen.getByText("Record Payment")).toBeInTheDocument());
  });

  it("shows backend pending when listCustomerPayments 404", async () => {
    vi.mocked(customersApi.listCustomerPayments).mockRejectedValue(new ApiError(404, {}));
    render(wrap(<CustomerDetailPage />));
    await waitFor(() => expect(screen.getByText(/Backend pending/i)).toBeInTheDocument());
  });
});
