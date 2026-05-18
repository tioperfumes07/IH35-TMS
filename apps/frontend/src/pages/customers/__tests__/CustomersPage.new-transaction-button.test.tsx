import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import type { ReactElement } from "react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import type { Customer } from "../../../api/mdata";
import { ToastProvider } from "../../../components/Toast";
import { CustomersPage } from "../../Customers";

const listCustomersMock = vi.fn();
const listInvoicesMock = vi.fn();
const getCustomerBillingSummaryMock = vi.fn();

vi.mock("../../../api/accounting", () => ({
  listInvoices: (...args: unknown[]) => listInvoicesMock(...args),
}));

vi.mock("../../../api/mdata", () => ({
  listCustomers: (...args: unknown[]) => listCustomersMock(...args),
  getCustomerBillingSummary: (...args: unknown[]) => getCustomerBillingSummaryMock(...args),
}));

vi.mock("../../../contexts/CompanyContext", () => ({
  useCompanyContext: () => ({
    selectedCompanyId: "91f6d7d8-0f3a-4c2d-8e1b-2c3d4e5f6071",
  }),
}));

function customer(p: Partial<Customer> & Pick<Customer, "id" | "name">): Customer {
  return {
    id: p.id,
    name: p.name,
    customer_code: null,
    email: null,
    phone: null,
    billing_address: null,
    billing_state: null,
    mc_number: null,
    dot_number: null,
    tax_id: null,
    credit_limit: null,
    credit_limit_source: null,
    credit_limit_updated_at: null,
    payment_terms_id: null,
    operating_company_id: "91f6d7d8-0f3a-4c2d-8e1b-2c3d4e5f6071",
    customer_type: "broker",
    status: "active",
    default_billing_miles_basis: "practical_miles",
    default_free_time_hours: "0",
    default_detention_rate: "0",
    notes: null,
    website: null,
    office_phone: null,
    fax_phone: null,
    main_contact_name: null,
    main_contact_title: null,
    main_contact_email: null,
    main_contact_phone: null,
    main_contact_mobile: null,
    ar_email: null,
    ar_phone: null,
    ap_email: null,
    ap_phone: null,
    free_time_pickup_minutes: 0,
    free_time_delivery_minutes: 0,
    detention_rate_per_hour: "0",
    layover_charge_per_day: null,
    layover_currency: null,
    layover_first_night_free: true,
    layover_max_days: null,
    layover_notes: null,
    factoring_eligible: true,
    factoring_company_vendor_id: null,
    factoring_advance_rate_override: null,
    factoring_reserve_pct_override: null,
    factoring_recourse_type: null,
    factoring_notes: null,
    quality_overall_flag: "standard",
    quality_payment_score: null,
    quality_cancellation_score: null,
    quality_disputes_count: 0,
    quality_last_evaluated_at: null,
    quality_notes: null,
    fmcsa_verified_at: null,
    fmcsa_lookup_id: null,
    fmcsa_authority_status_at_verification: null,
    fmcsa_last_checked_at: null,
    fmcsa_check_response: null,
    created_at: "",
    updated_at: "",
    deactivated_at: null,
    created_by_user_id: "",
    updated_by_user_id: "",
  };
}

function wrap(ui: ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <MemoryRouter>
      <QueryClientProvider client={queryClient}>
        <ToastProvider>{ui}</ToastProvider>
      </QueryClientProvider>
    </MemoryRouter>
  );
}

describe("CustomersPage detail header", () => {
  it("renders New transaction button label", async () => {
    listInvoicesMock.mockResolvedValue({ invoices: [] });
    getCustomerBillingSummaryMock.mockResolvedValue({ aging_buckets: { total_open: 0, bucket_91_plus: 0 } });
    listCustomersMock.mockResolvedValue({
      customers: [customer({ id: "c-1", name: "Customer One" })],
    });

    render(wrap(<CustomersPage />));
    expect(await screen.findByRole("button", { name: "New transaction" })).toBeInTheDocument();
  });
});
