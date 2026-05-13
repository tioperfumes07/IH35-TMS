import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactElement } from "react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
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

async function clickSaveInCreateModal(user: ReturnType<typeof userEvent.setup>) {
  const buttons = screen.getAllByRole("button", { name: /^Save$/i });
  await user.click(buttons[buttons.length - 1]!);
}

describe("DriversPage create driver validation", () => {
  it("shows inline field error when required fields missing", async () => {
    const user = userEvent.setup();
    render(wrap(<DriversPage />));
    await user.click(screen.getByRole("button", { name: /\+ Create Driver/i }));
    await screen.findByRole("heading", { name: /create driver/i });
    await clickSaveInCreateModal(user);
    await waitFor(() => {
      expect(document.getElementById("first_name-error")).toBeTruthy();
    });
  });

  it("clears first_name error when user types", async () => {
    const user = userEvent.setup();
    render(wrap(<DriversPage />));
    await user.click(screen.getByRole("button", { name: /\+ Create Driver/i }));
    await screen.findByRole("heading", { name: /create driver/i });
    await clickSaveInCreateModal(user);
    await waitFor(() => {
      expect(document.getElementById("first_name-error")).toBeTruthy();
    });
    const firstName = document.querySelector<HTMLInputElement>('[data-field="first_name"]');
    expect(firstName).toBeTruthy();
    await user.type(firstName!, "J");
    await waitFor(() => {
      expect(document.getElementById("first_name-error")).toBeNull();
    });
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
    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(/Could not save/i);
    });
    await waitFor(() => {
      expect(document.getElementById("cdl_number-error")).toBeTruthy();
    });
  });
});
