import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "../../../components/Toast";
import type { Driver } from "../../../types/api";
import { DriversPage } from "../../Drivers";

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

vi.mock("../../../api/org", () => ({
  listMyCompanies: vi.fn().mockResolvedValue({
    companies: [
      {
        id: "91f6d7d8-0f3a-4c2d-8e1b-2c3d4e5f6071",
        code: "TST",
        legal_name: "Test OpCo",
        short_name: "Test",
        company_type: "operating_carrier",
        is_active: true,
        is_default: true,
      },
    ],
  }),
}));

vi.mock("../../../api/catalogs", () => ({
  listUsStates: vi.fn().mockResolvedValue({ states: [{ id: "1", code: "TX", name: "Texas", region: "South" }] }),
  listMexicoStates: vi.fn().mockResolvedValue({ states: [] }),
}));

const listDriversMock = vi.fn();

vi.mock("../../../api/mdata", () => ({
  listDrivers: (...args: unknown[]) => listDriversMock(...args),
  checkReturningDriver: vi.fn().mockResolvedValue({ returning_driver: false }),
  listDriverTeams: vi.fn().mockResolvedValue({ teams: [] }),
  getDriverTeam: vi.fn(),
  createDriverTeam: vi.fn(),
  updateDriverTeam: vi.fn(),
  deactivateDriverTeam: vi.fn(),
  createDriver: vi.fn(),
}));

function makeDriver(p: Pick<Driver, "id" | "first_name" | "last_name" | "status">): Driver {
  return {
    id: p.id,
    operating_company_id: "91f6d7d8-0f3a-4c2d-8e1b-2c3d4e5f6071",
    identity_user_id: null,
    first_name: p.first_name,
    last_name: p.last_name,
    phone: "5555555555",
    email: null,
    cdl_number: null,
    cdl_state: null,
    cdl_class: "A",
    cdl_expires_at: null,
    hire_date: null,
    pay_basis: "short_miles",
    termination_date: null,
    dot_medical_expires_at: null,
    hazmat_endorsement_expires_at: null,
    visa_type: null,
    visa_number: null,
    visa_expires_at: null,
    passport_number: null,
    passport_expires_at: null,
    ine_number: null,
    curp: null,
    mx_address_line1: null,
    mx_address_line2: null,
    mx_city: null,
    mx_state: null,
    mx_postal_code: null,
    emergency_contact_name: null,
    emergency_contact_relationship: null,
    emergency_contact_phone_primary: null,
    emergency_contact_phone_alternate: null,
    emergency_contact_address: null,
    emergency_contact_notes: null,
    preferred_language: "en",
    qbo_vendor_id: null,
    qbo_vendor_linked_at: null,
    qbo_vendor_linked_by_user_id: null,
    status: p.status,
    notes: null,
    prior_driver_id: null,
    rehire_count: 0,
    is_rehire: false,
    created_at: "2020-01-01T00:00:00.000Z",
    updated_at: "2020-01-01T00:00:00.000Z",
    deactivated_at: null,
    created_by_user_id: "u",
    updated_by_user_id: "u",
  };
}

function renderDriversAt(initialPath: string) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const router = createMemoryRouter(
    [
      {
        path: "/drivers",
        element: (
          <QueryClientProvider client={queryClient}>
            <ToastProvider>
              <DriversPage />
            </ToastProvider>
          </QueryClientProvider>
        ),
      },
    ],
    { initialEntries: [initialPath] }
  );
  render(<RouterProvider router={router} />);
  return router;
}

describe("DriversPage list status tabs", () => {
  beforeEach(() => {
    listDriversMock.mockResolvedValue({
      drivers: [
        makeDriver({ id: "1", first_name: "Ann", last_name: "ActiveOnly", status: "Active" }),
        makeDriver({ id: "2", first_name: "Ike", last_name: "InactiveOnly", status: "Inactive" }),
      ],
    });
  });

  it("default route (no status param) shows Active-only — hidden drivers excluded", async () => {
    // AUTO-01: the standalone roster defaults to Active so hidden (Inactive) drivers don't clutter it.
    renderDriversAt("/drivers");
    await waitFor(() => expect(listDriversMock).toHaveBeenCalledWith(expect.objectContaining({ status: "All" })));
    expect(await screen.findByText(/Ann ActiveOnly/)).toBeInTheDocument();
    expect(screen.queryByText(/Ike InactiveOnly/)).toBeNull();
  });

  it("?status=all shows every row (active + inactive)", async () => {
    renderDriversAt("/drivers?status=all");
    expect(await screen.findByText(/Ann ActiveOnly/)).toBeInTheDocument();
    expect(screen.getByText(/Ike InactiveOnly/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /all \(2\)/i })).toBeInTheDocument();
  });

  it("clicking Active from All filters to active and clears the status param (active is the default)", async () => {
    const user = userEvent.setup();
    const router = renderDriversAt("/drivers?status=all");
    await screen.findByText(/Ike InactiveOnly/);
    await user.click(screen.getByRole("button", { name: /^active \(1\)$/i }));
    expect(screen.getByText(/Ann ActiveOnly/)).toBeInTheDocument();
    expect(screen.queryByText(/Ike InactiveOnly/)).toBeNull();
    expect(router.state.location.search).not.toContain("status=");
  });

  it("browser back returns to the All tab", async () => {
    const user = userEvent.setup();
    const router = renderDriversAt("/drivers?status=all");
    await screen.findByText(/Ike InactiveOnly/);
    await user.click(screen.getByRole("button", { name: /^active \(1\)$/i }));
    await waitFor(() => expect(screen.queryByText(/Ike InactiveOnly/)).toBeNull());
    router.navigate(-1);
    await waitFor(() => expect(screen.getByText(/Ike InactiveOnly/)).toBeInTheDocument());
  });

  it("renders + Create Driver as a labeled primary button", async () => {
    renderDriversAt("/drivers");
    const addDriverButton = await screen.findByRole("button", { name: "+ Create Driver" });
    expect(addDriverButton).toHaveTextContent("+ Create Driver");
    expect(addDriverButton.className).toContain("bg-[#16A34A]");
  });
});
