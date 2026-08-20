import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactElement } from "react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DriversListPage } from "./DriversListPage";
import { ToastProvider } from "../../components/Toast";

// SM1 — proves the Safety/Profiles DQF surface exposes the SINGLE shared driver creator, and that a
// successful create routes the user straight to the new driver's DQF via onOpenProfile.

vi.mock("../../contexts/CompanyContext", () => ({
  useCompanyContext: () => ({ selectedCompanyId: "91f6d7d8-0f3a-4c2d-8e1b-2c3d4e5f6071" }),
}));

const createDriverMock = vi.fn();
vi.mock("../../api/mdata", () => ({
  listDrivers: vi.fn().mockResolvedValue({ drivers: [], total: 0 }),
  checkReturningDriver: vi.fn().mockResolvedValue({ returning_driver: false }),
  createDriver: (...args: unknown[]) => createDriverMock(...args),
}));

vi.mock("../../api/safety", () => ({
  listDriverQualificationItems: vi.fn().mockResolvedValue({ items: [] }),
  getUserPreferences: vi.fn().mockResolvedValue({ preferences: {} }),
  patchUserPreferences: vi.fn().mockResolvedValue({ preferences: {} }),
}));

vi.mock("../../api/org", () => ({
  listMyCompanies: vi.fn().mockResolvedValue({
    companies: [
      { id: "91f6d7d8-0f3a-4c2d-8e1b-2c3d4e5f6071", code: "TST", legal_name: "Test OpCo", short_name: "Test", is_default: true },
    ],
  }),
}));

vi.mock("../../api/catalogs", () => ({
  listUsStates: vi.fn().mockResolvedValue({ states: [] }),
  listMexicoStates: vi.fn().mockResolvedValue({ states: [] }),
}));

function wrap(ui: ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={client}>
      <ToastProvider>
        <MemoryRouter>{ui}</MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>
  );
}

describe("DriversListPage create-driver entry (SM1)", () => {
  afterEach(cleanup);

  it("renders the + Create driver button", async () => {
    render(wrap(<DriversListPage />));
    expect(await screen.findByRole("button", { name: /\+ Create driver/i })).toBeInTheDocument();
  });

  it("opens the shared creator and fires onOpenProfile with the new id on success", async () => {
    createDriverMock.mockResolvedValue({
      id: "new-driver-123",
      phone: "+19565550001",
      invite_url: "https://example.test/invite/abc",
      linked_user_event_type: "new_user_created",
    });
    const onOpenProfile = vi.fn();
    const user = userEvent.setup();
    render(wrap(<DriversListPage onOpenProfile={onOpenProfile} />));

    await user.click(await screen.findByRole("button", { name: /\+ Create driver/i }));
    await screen.findByRole("heading", { name: /create driver/i });

    await user.type(document.querySelector('[data-field="first_name"]')!, "Jane");
    await user.type(document.querySelector('[data-field="last_name"]')!, "Doe");
    await user.type(document.querySelector('[data-field="phone_input"]')!, "9565550001");

    const saveButtons = screen.getAllByRole("button", { name: /^Save$/i });
    await user.click(saveButtons[saveButtons.length - 1]!);

    await waitFor(() => {
      expect(createDriverMock).toHaveBeenCalledTimes(1);
    });
    await waitFor(() => {
      expect(onOpenProfile).toHaveBeenCalledWith("new-driver-123");
    });
  });
});
