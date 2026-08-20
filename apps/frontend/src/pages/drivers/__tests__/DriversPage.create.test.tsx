import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactElement } from "react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../../../api/client";
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
  checkReturningDriver: vi.fn().mockResolvedValue({ returning_driver: false }),
  listDriverTeams: vi.fn().mockResolvedValue({ teams: [] }),
  getDriverTeam: vi.fn(),
  createDriverTeam: vi.fn(),
  updateDriverTeam: vi.fn(),
  deactivateDriverTeam: vi.fn(),
  createDriver: (...args: unknown[]) => createDriverMock(...args),
}));

function wrap(ui: ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <ToastProvider>{ui}</ToastProvider>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

// The creator is now a 4-step wizard (Identity -> Licenses -> Border & emergency -> DQ docs &
// drug screen) — Save only renders on step 4, gated behind the drug-screen acknowledgment
// checkbox. Advance through the intervening steps before looking for Save.
async function advanceToSaveStep(user: ReturnType<typeof userEvent.setup>) {
  for (let i = 0; i < 3; i++) {
    await user.click(await screen.findByTestId("driver-create-wizard-next"));
  }
  await user.click(await screen.findByTestId("driver-create-drug-screen-ack"));
}

async function clickSaveInCreateModal(user: ReturnType<typeof userEvent.setup>) {
  await advanceToSaveStep(user);
  const buttons = screen.getAllByRole("button", { name: /^Save$/i });
  await user.click(buttons[buttons.length - 1]!);
}

describe("DriversPage create driver validation", () => {
  afterEach(cleanup);

  // These two tests predate the 4-step wizard. The scenario they guarded — a driver getting
  // created without a first name — is now prevented earlier and more strongly: step 1's Next
  // button is disabled until identity fields (incl. first_name) are filled, so the wizard can
  // never even reach Save without them. There is no Save-time "first_name-error" DOM node to
  // find anymore because there is no code path that reaches Save without a first name. Rewritten
  // to verify the real current guarantee instead of a Save-time error that no longer occurs.
  it("keeps wizard Next disabled until required identity fields are filled, then enables it", async () => {
    const user = userEvent.setup();
    render(wrap(<DriversPage />));
    await user.click(screen.getByRole("button", { name: /\+ Create Driver/i }));
    await screen.findByRole("heading", { name: /create driver/i });

    const next = await screen.findByTestId("driver-create-wizard-next");
    expect(next).toBeDisabled();

    await user.type(document.querySelector('[data-field="first_name"]')!, "Jane");
    expect(next).toBeDisabled();
    await user.type(document.querySelector('[data-field="last_name"]')!, "Doe");
    expect(next).toBeDisabled();
    await user.type(document.querySelector('[data-field="phone_input"]')!, "5551234567");

    await waitFor(() => expect(next).not.toBeDisabled());
  });

  it("shows API field conflict on CDL fields", async () => {
    createDriverMock.mockRejectedValue(
      new ApiError(409, {
        message: "Driver with this CDL already exists",
        fieldErrors: { cdl_number: "Already in use", cdl_state: "Already in use" },
      })
    );
    const user = userEvent.setup();
    render(wrap(<DriversPage />));
    await user.click(screen.getByRole("button", { name: /\+ Create Driver/i }));
    await screen.findByRole("heading", { name: /create driver/i });
    await user.type(document.querySelector('[data-field="first_name"]')!, "Jane");
    await user.type(document.querySelector('[data-field="last_name"]')!, "Doe");
    await user.type(document.querySelector('[data-field="phone_input"]')!, "5551234567");
    await clickSaveInCreateModal(user);
    // This asserted a single alert reading /Could not save/i. Two things were wrong with that, and
    // neither was a product defect:
    //  1. "Could not save" is VendorCreateModal's wording — the driver create modal never emits it.
    //     It surfaces the API's own message, which is strictly better: "Driver with this CDL already
    //     exists" tells the user what to fix; "Could not save" does not.
    //  2. getByRole("alert") is singular, and the modal correctly raises TWO alerts — the toast and
    //     the inline field error. Asserting there is exactly one alert forbids the inline error the
    //     next assertion then requires.
    // So the expectation is corrected to the real, correct behaviour rather than the product being
    // bent to fit a stale string.
    await waitFor(() => {
      const alerts = screen.getAllByRole("alert");
      expect(alerts.some((el) => /Driver with this CDL already exists/i.test(el.textContent ?? ""))).toBe(true);
    });
    // The failing cdl_number/cdl_state fields live on step 2, but the error lands while the
    // wizard is on step 4 (Save only exists there) — the field errors persist in state and the
    // wizard doesn't unmount them, they're just off-screen until the operator navigates back to
    // the step that owns them. Follow that real path (Back x2) rather than asserting the
    // Save-time DOM directly, which no longer contains step-2 fields while on step 4.
    await user.click(await screen.findByTestId("driver-create-wizard-back"));
    await user.click(await screen.findByTestId("driver-create-wizard-back"));
    await waitFor(() => {
      expect(document.getElementById("cdl_number-error")).toBeTruthy();
    });
  });
});
