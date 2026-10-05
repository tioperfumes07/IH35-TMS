import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "../../../components/Toast";
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

const createDriverMock = vi.fn();
vi.mock("../../../api/mdata", () => ({
  listDrivers: vi.fn().mockResolvedValue({ drivers: [] }),
  listAllDrivers: vi.fn().mockResolvedValue({ drivers: [] }),
  checkReturningDriver: vi.fn().mockResolvedValue({ returning_driver: false }),
  listDriverTeams: vi.fn().mockResolvedValue({ teams: [] }),
  getDriverTeam: vi.fn(),
  createDriverTeam: vi.fn(),
  updateDriverTeam: vi.fn(),
  deactivateDriverTeam: vi.fn(),
  createDriver: (...args: unknown[]) => createDriverMock(...args),
}));

vi.mock("../../../api/driverFinance", () => ({
  listSettlements: vi.fn().mockResolvedValue({ settlements: [] }),
  listPendingEscrowDeductions: vi.fn().mockResolvedValue({ deductions: [] }),
}));
vi.mock("../../../api/banking", () => ({
  getEscrowDriverBalances: vi.fn().mockResolvedValue({ drivers: [] }),
}));
vi.mock("../../../api/cashAdvanceRequests", () => ({
  cashAdvanceRequestsOfficeApi: { list: vi.fn().mockResolvedValue({ requests: [] }) },
}));
vi.mock("../../../api/liabilities", () => ({
  getActiveLiabilities: vi.fn().mockResolvedValue({ liabilities: [] }),
}));
vi.mock("../../../api/dispatch", () => ({
  listAllDispatchLoads: vi.fn().mockResolvedValue({ loads: [] }),
}));
vi.mock("../../../api/preSettlements", () => ({
  listOpenPreSettlements: vi.fn().mockResolvedValue({ pre_settlements: [] }),
}));
vi.mock("../../../api/samsara", () => ({
  getSamsaraHealth: vi.fn().mockResolvedValue({ ok: true }),
}));

function renderDriversHome(initialPath = "/drivers") {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const page = (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <DriversPage />
      </ToastProvider>
    </QueryClientProvider>
  );
  const router = createMemoryRouter(
    [
      { path: "/drivers", element: page },
      { path: "/drivers/roster", element: page },
    ],
    { initialEntries: [initialPath] }
  );
  render(<RouterProvider router={router} />);
  return router;
}

describe("DriversPage create driver validation", () => {
  afterEach(cleanup);

  it("opens the create wizard from Driver Home", async () => {
    const user = userEvent.setup();
    const router = renderDriversHome("/drivers");
    await user.click(screen.getByRole("button", { name: /\+ Create Driver/i }));
    expect(await screen.findByRole("heading", { name: /create driver/i })).toBeInTheDocument();
    expect(screen.getByTestId("driver-create-wizard")).toBeInTheDocument();
    expect(router.state.location.search).toContain("create=1");
    expect(screen.getByRole("button", { name: /^next$/i })).toBeDisabled();
  });

  it("keeps Next disabled until identity fields are filled, then enables it", async () => {
    const user = userEvent.setup();
    renderDriversHome("/drivers?create=1");
    expect(await screen.findByRole("heading", { name: /create driver/i })).toBeInTheDocument();
    const next = screen.getByRole("button", { name: /^next$/i });
    expect(next).toBeDisabled();
    const firstName = document.querySelector<HTMLInputElement>('[data-field="first_name"]');
    const lastName = document.querySelector<HTMLInputElement>('[data-field="last_name"]');
    const phone = document.querySelector<HTMLInputElement>('[data-field="phone_input"]');
    expect(firstName).toBeTruthy();
    await user.type(firstName!, "Jane");
    await user.type(lastName!, "Doe");
    await user.type(phone!, "5551234567");
    await waitFor(() => expect(next).not.toBeDisabled());
  });

  it("opens the licenses step after identity is complete", async () => {
    const user = userEvent.setup();
    renderDriversHome("/drivers?create=1");
    expect(await screen.findByRole("heading", { name: /create driver/i })).toBeInTheDocument();
    await user.type(document.querySelector('[data-field="first_name"]')!, "Jane");
    await user.type(document.querySelector('[data-field="last_name"]')!, "Doe");
    await user.type(document.querySelector('[data-field="phone_input"]')!, "5551234567");
    await user.click(screen.getByRole("button", { name: /^next$/i }));
    expect(await screen.findByText(/step 2 of 4/i)).toBeInTheDocument();
    expect(document.querySelector('[data-field="cdl_number"]')).toBeTruthy();
  });
});
