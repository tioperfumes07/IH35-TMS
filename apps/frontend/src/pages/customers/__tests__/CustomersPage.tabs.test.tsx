import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import type { Customer } from "../../../api/mdata";
import { ToastProvider } from "../../../components/Toast";
import { useAuth } from "../../../auth/useAuth";
import { CustomersPage } from "../../Customers";

vi.mock("../../../auth/useAuth", () => ({
  useAuth: vi.fn(),
}));

const listCustomersMock = vi.fn();

vi.mock("../../../api/mdata", () => ({
  listCustomers: (...args: unknown[]) => listCustomersMock(...args),
  listPaymentTermOptions: vi.fn().mockResolvedValue({ payment_terms: [] }),
  listVendors: vi.fn().mockResolvedValue({ vendors: [] }),
  createCustomer: vi.fn(),
  updateCustomer: vi.fn(),
}));

vi.mock("../../../api/catalogs", () => ({
  listUsStates: vi.fn().mockResolvedValue({ states: [] }),
}));

function minimalCustomer(p: Partial<Customer> & Pick<Customer, "id" | "name">): Customer {
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
    status: p.status ?? "active",
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
    factoring_company_vendor_id: p.factoring_company_vendor_id ?? null,
    factoring_advance_rate_override: null,
    factoring_reserve_pct_override: null,
    factoring_recourse_type: null,
    factoring_notes: null,
    quality_overall_flag: p.quality_overall_flag ?? "standard",
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

function renderCustomersAt(path: string) {
  vi.mocked(useAuth).mockReturnValue({
    user: { uuid: "u1", email: "o@test.com", role: "Owner" },
    session: null,
    isLoading: false,
    isUnauthenticated: false,
    refetch: vi.fn(),
  });

  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const router = createMemoryRouter(
    [
      {
        path: "/customers",
        element: (
          <QueryClientProvider client={queryClient}>
            <ToastProvider>
              <CustomersPage />
            </ToastProvider>
          </QueryClientProvider>
        ),
      },
    ],
    { initialEntries: [path] }
  );
  render(<RouterProvider router={router} />);
  return router;
}

describe("CustomersPage list tabs", () => {
  it("defaults to All and shows Preferred tab counts", async () => {
    listCustomersMock.mockResolvedValue({
      customers: [
        minimalCustomer({ id: "1", name: "Preferred Co", quality_overall_flag: "preferred" }),
        minimalCustomer({ id: "2", name: "Caution Co", quality_overall_flag: "caution" }),
      ],
    });
    renderCustomersAt("/customers");
    await waitFor(() => expect(listCustomersMock).toHaveBeenCalled());
    expect(await screen.findByRole("button", { name: /preferred \(1\)/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /watch \(1\)/i })).toBeInTheDocument();
  });

  it("clicking Preferred filters rows and sets ?tab=preferred", async () => {
    const user = userEvent.setup();
    listCustomersMock.mockResolvedValue({
      customers: [
        minimalCustomer({ id: "1", name: "Preferred Co", quality_overall_flag: "preferred" }),
        minimalCustomer({ id: "2", name: "Other Co", quality_overall_flag: "standard" }),
      ],
    });
    const router = renderCustomersAt("/customers");
    await screen.findByText("Preferred Co");
    await user.click(screen.getByRole("button", { name: /preferred \(1\)/i }));
    expect(screen.getByText("Preferred Co")).toBeInTheDocument();
    expect(screen.queryByText("Other Co")).toBeNull();
    expect(router.state.location.search).toContain("tab=preferred");
  });
});
