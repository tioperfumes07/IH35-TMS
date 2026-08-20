import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "../../../components/Toast";
import type { Driver } from "../../../types/api";
import { makeDriver as sharedMakeDriver } from "../../../test-utils/factories";
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
  // Delegates to the shared factory (src/test-utils/factories.ts) so a new REQUIRED field on
  // Driver breaks one default object there, not this fixture. Overrides below are the values
  // this suite historically used and that its assertions depend on -- preserved exactly.
  return sharedMakeDriver({
    id: p.id,
    first_name: p.first_name,
    last_name: p.last_name,
    status: p.status,
    operating_company_id: "91f6d7d8-0f3a-4c2d-8e1b-2c3d4e5f6071",
    cdl_class: "A",
    pay_basis: "short_miles",
    created_at: "2020-01-01T00:00:00.000Z",
    updated_at: "2020-01-01T00:00:00.000Z",
    created_by_user_id: "u",
    updated_by_user_id: "u",
  });
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
        makeDriver({ id: "3", first_name: "Pete", last_name: "ProbationOnly", status: "Probation" }),
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

  it("?status=all shows every row (active + inactive + probation)", async () => {
    renderDriversAt("/drivers?status=all");
    expect(await screen.findByText(/Ann ActiveOnly/)).toBeInTheDocument();
    expect(screen.getByText(/Ike InactiveOnly/)).toBeInTheDocument();
    expect(screen.getByText(/Pete ProbationOnly/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /all \(3\)/i })).toBeInTheDocument();
  });

  it("?status=probation shows only probation drivers", async () => {
    renderDriversAt("/drivers?status=probation");
    await waitFor(() => expect(listDriversMock).toHaveBeenCalledWith(expect.objectContaining({ status: "All" })));
    // waitFor above only confirms the mock was called, not that the resulting React Query state
    // update has committed to the DOM — findByText (unlike getByText) actually waits for that
    // render, so assert the positive case first and only then check the negatives.
    expect(await screen.findByText(/Pete ProbationOnly/)).toBeInTheDocument();
    expect(screen.queryByText(/Ann ActiveOnly/)).toBeNull();
    expect(screen.queryByText(/Ike InactiveOnly/)).toBeNull();
    expect(screen.getByRole("button", { name: /^probation \(1\)$/i })).toBeInTheDocument();
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
    expect(addDriverButton.className).toContain("bg-[#1f2a44]");
  });

  it("Teams tab switches to the teams roster and + Create Team", async () => {
    const user = userEvent.setup();
    const router = renderDriversAt("/drivers");
    await screen.findByRole("button", { name: "+ Create Driver" });
    await user.click(screen.getByRole("button", { name: /^teams$/i }));
    expect(await screen.findByRole("button", { name: "+ Create Team" })).toBeInTheDocument();
    expect(screen.queryByPlaceholderText("Search by name")).toBeNull();
    expect(router.state.location.search).toContain("view=teams");
  });

  it("?view=teams deep link opens Teams roster", async () => {
    renderDriversAt("/drivers?view=teams");
    expect(await screen.findByRole("button", { name: "+ Create Team" })).toBeInTheDocument();
    expect(screen.queryByPlaceholderText("Search by name")).toBeNull();
  });

  it("Drivers tab returns to the roster from Teams view", async () => {
    const user = userEvent.setup();
    const router = renderDriversAt("/drivers?view=teams");
    await screen.findByRole("button", { name: "+ Create Team" });
    await user.click(screen.getByRole("button", { name: /^drivers$/i }));
    expect(await screen.findByPlaceholderText("Search by name")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "+ Create Team" })).toBeNull();
    expect(router.state.location.search).not.toContain("view=");
  });
});
