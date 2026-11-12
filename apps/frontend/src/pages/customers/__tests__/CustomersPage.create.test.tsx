import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactElement } from "react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { ApiError } from "../../../api/client";
import { ToastProvider } from "../../../components/Toast";
import { CustomersPage } from "../../Customers";

vi.mock("../../../auth/useAuth", () => ({
  useAuth: () => ({
    user: { role: "Owner", uuid: "81111181-1111-4111-8111-111111111111" },
    session: null,
    isLoading: false,
    isError: false,
    isUnauthenticated: false,
    refetch: vi.fn(),
  }),
}));

vi.mock("../../../contexts/CompanyContext", () => ({
  useCompanyContext: () => ({
    selectedCompanyId: "91f6d7d8-0f3a-4c2d-8e1b-2c3d4e5f6071",
    companies: [],
    selectedCompany: null,
    isLoading: false,
    setSelectedCompany: vi.fn(),
    setDefaultCompanyForUser: vi.fn().mockResolvedValue(undefined),
  }),
}));

vi.mock("../../../api/mdata", () => ({
  listCustomers: vi.fn().mockResolvedValue({ customers: [] }),
  listAllCustomers: vi.fn().mockResolvedValue({ customers: [], total: 0 }),
  getCustomerBillingSummary: vi.fn().mockResolvedValue({ aging_buckets: {} }),
  getCustomerRosterCounts: vi.fn().mockResolvedValue({
    with_transactions: 0,
    open_balance: 0,
    factored: 0,
    all: 0,
    possible_duplicates: 0,
  }),
  getCustomerFinanceRollup: vi.fn().mockResolvedValue([]),
  listAllAtRiskCustomerRelationshipScores: vi.fn().mockResolvedValue({ customers: [] }),
  listPaymentTermOptions: vi.fn().mockResolvedValue({ payment_terms: [] }),
  listVendors: vi.fn().mockResolvedValue({ vendors: [] }),
  createCustomer: vi.fn(),
  updateCustomer: vi.fn(),
}));

vi.mock("../../../api/reports", () => ({
  getCustomerProfitability: vi.fn().mockResolvedValue({ period: { start: "", end: "" }, totals: { revenue_cents: 0, direct_cost_cents: 0, gross_margin_cents: 0, gross_margin_pct: 0, customer_count: 0 }, by_customer: [] }),
}));

vi.mock("../../../api/catalogs", () => ({
  listUsStates: vi.fn().mockResolvedValue({ states: [] }),
}));

import { createCustomer } from "../../../api/mdata";

function wrap(ui: ReactElement, initialEntries: string[] = ["/customers"]) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={initialEntries}>
        <ToastProvider>{ui}</ToastProvider>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("CustomersPage create validation", () => {
  it("opens the create drawer from ?create=1 without legacy master-detail chrome", async () => {
    render(wrap(<CustomersPage />, ["/customers?create=1"]));
    expect(await screen.findByRole("heading", { name: /create customer/i })).toBeTruthy();
    expect(screen.getByTestId("customers-create-only")).toBeTruthy();
    expect(screen.queryByTestId("customers-master-detail-shell")).toBeNull();
    expect(screen.queryByTestId("customers-home-kpi-strip")).toBeNull();
  });

  it("shows legal_name error on empty submit", async () => {
    const user = userEvent.setup();
    vi.mocked(createCustomer).mockResolvedValue({ ok: true } as never);
    render(wrap(<CustomersPage />));
    await user.click(screen.getByRole("button", { name: /\+ Create Customer/i }));
    await screen.findByRole("heading", { name: /create customer/i });
    await user.click(screen.getByRole("button", { name: /^Save$/i }));
    await waitFor(() => {
      expect(document.getElementById("legal_name-error")).toBeTruthy();
    });
  });

  it("D1-5: blocks submit and does NOT call createCustomer when customer_type is empty", async () => {
    const user = userEvent.setup();
    vi.mocked(createCustomer).mockResolvedValue({ ok: true } as never);
    render(wrap(<CustomersPage />));
    await user.click(screen.getByRole("button", { name: /\+ Create Customer/i }));
    await screen.findByRole("heading", { name: /create customer/i });
    // Provide a legal name but leave customer_type unselected.
    await user.type(document.querySelector('[data-field="legal_name"]')!, "Acme Logistics");
    await user.click(screen.getByRole("button", { name: /^Save$/i }));
    await waitFor(() => {
      expect(document.getElementById("customer_type-error")).toBeTruthy();
    });
    expect(createCustomer).not.toHaveBeenCalled();
  });

  it("maps 409 conflict to field", async () => {
    const user = userEvent.setup();
    vi.mocked(createCustomer).mockRejectedValue(
      new ApiError(409, {
        message: "Customer with this mc_number already exists",
        fieldErrors: { mc_number: "Already in use" },
      })
    );
    render(wrap(<CustomersPage />, ["/customers?create=1"]));
    await screen.findByRole("heading", { name: /create customer/i });
    await user.type(screen.getByLabelText(/Customer display name/i), "Acme Logistics");
    await user.click(screen.getByRole("combobox", { name: /Customer type/i }));
    await user.click(await screen.findByRole("option", { name: /^Broker$/i }));
    await user.type(screen.getByLabelText(/^Email/i), "billing@acme.test");
    await user.click(screen.getByRole("button", { name: /^Save$/i }));
    await waitFor(() => {
      const alerts = screen.getAllByRole("alert");
      expect(alerts.some((a) => /Could not save/i.test(a.textContent ?? ""))).toBe(true);
    });
    await waitFor(() => {
      expect(document.getElementById("mc_number-error")).toBeTruthy();
    });
  });
});
