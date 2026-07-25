/**
 * LST-F10 — the Driver Teams Lists page must be a real, data-fetching screen wired to
 * /api/v1/mdata/driver-teams (it shipped as a prose placeholder with zero fetching).
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DriverTeamsPage } from "../DriverTeamsPage";

const COMPANY_ID = "91e0bf0a-133f-4ce8-a734-2586cfa66d96";

const listMdataDriverTeams = vi.fn();
const deactivateMdataDriverTeam = vi.fn();

vi.mock("../../../../contexts/CompanyContext", () => ({
  useCompanyContext: () => ({
    selectedCompanyId: COMPANY_ID,
    companies: [],
    selectedCompany: null,
    isLoading: false,
    setSelectedCompany: vi.fn(),
    setDefaultCompanyForUser: vi.fn().mockResolvedValue(undefined),
  }),
}));

vi.mock("../../../../api/driver-teams", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../../api/driver-teams")>();
  return {
    ...actual,
    listMdataDriverTeams: (...args: unknown[]) => listMdataDriverTeams(...args),
    deactivateMdataDriverTeam: (...args: unknown[]) => deactivateMdataDriverTeam(...args),
  };
});

// The driver picker fetches its own roster; keep it inert so the page test stays about the page.
vi.mock("../../../../components/drivers/DriverPickerWithCreate", () => ({
  DriverPickerWithCreate: () => <div data-testid="driver-picker" />,
}));

const TEAM = {
  id: "0197a1f0-0000-7000-8000-000000000001",
  operating_company_id: COMPANY_ID,
  team_name: "Laredo Night Team",
  primary_driver_id: "0197a1f0-0000-7000-8000-0000000000a1",
  primary_driver_first_name: "Juan",
  primary_driver_last_name: "Perez",
  secondary_driver_id: "0197a1f0-0000-7000-8000-0000000000a2",
  secondary_driver_first_name: "Maria",
  secondary_driver_last_name: "Lopez",
  relationship: "Spouse",
  notes: null,
  is_active: true,
  effective_from: "2026-07-01",
  effective_to: null,
  created_at: "2026-07-01T00:00:00.000Z",
  updated_at: null,
  created_by_user_id: null,
};

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <DriverTeamsPage />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("DriverTeamsPage (LST-F10)", () => {
  beforeEach(() => {
    listMdataDriverTeams.mockReset();
    deactivateMdataDriverTeam.mockReset();
    listMdataDriverTeams.mockResolvedValue({ teams: [TEAM] });
  });

  it("fetches entity-scoped teams and renders both drivers", async () => {
    renderPage();

    await waitFor(() => expect(listMdataDriverTeams).toHaveBeenCalled());
    expect(listMdataDriverTeams).toHaveBeenCalledWith({ operating_company_id: COMPANY_ID, is_active: "true" });

    expect(await screen.findByText("Laredo Night Team")).toBeInTheDocument();
    expect(screen.getByText("Juan Perez")).toBeInTheDocument();
    expect(screen.getByText("Maria Lopez")).toBeInTheDocument();
  });

  it('offers "+ Create" (never "+ New" / "+ Add") and opens the create modal', async () => {
    const user = userEvent.setup();
    renderPage();

    const createButton = await screen.findByTestId("driver-teams-create");
    expect(createButton).toHaveTextContent("+ Create");
    expect(screen.queryByText(/\+ New/)).not.toBeInTheDocument();
    expect(screen.queryByText(/\+ Add/)).not.toBeInTheDocument();

    await user.click(createButton);
    expect(await screen.findByText("Create Driver Team")).toBeInTheDocument();
    expect(screen.getByTestId("driver-team-name")).toBeInTheDocument();
  });

  it("removes a team by DEACTIVATE (soft), never a delete", async () => {
    deactivateMdataDriverTeam.mockResolvedValue({ ...TEAM, is_active: false, effective_to: "2026-07-25" });
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByText("Laredo Night Team"));
    expect(await screen.findByText("Edit Driver Team")).toBeInTheDocument();

    await user.click(screen.getByTestId("driver-team-deactivate"));
    await waitFor(() => expect(deactivateMdataDriverTeam).toHaveBeenCalledWith(TEAM.id));
    expect(screen.queryByRole("button", { name: /delete/i })).not.toBeInTheDocument();
  });

  it("surfaces a load failure instead of rendering an empty screen", async () => {
    listMdataDriverTeams.mockRejectedValue(new Error("boom"));
    renderPage();

    expect(await screen.findByText(/failed to load/i)).toBeInTheDocument();
  });
});
