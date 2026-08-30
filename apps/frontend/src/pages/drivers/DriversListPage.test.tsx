import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { DriversListPage } from "./DriversListPage";
import { ToastProvider } from "../../components/Toast";

vi.mock("../../contexts/CompanyContext", () => ({
  useCompanyContext: () => ({ selectedCompanyId: "91f6d7d8-0f3a-4c2d-8e1b-2c3d4e5f6071" }),
}));

vi.mock("../../api/mdata", () => ({
  listDrivers: vi.fn().mockResolvedValue({
    drivers: [
      {
        id: "d1",
        operating_company_id: "91f6d7d8-0f3a-4c2d-8e1b-2c3d4e5f6071",
        first_name: "Alex",
        last_name: "Rivera",
        status: "Active",
        cdl_number: "TX123",
        cdl_state: "TX",
        cdl_expires_at: "2030-01-01",
        dot_medical_expires_at: "2030-01-01",
        emergency_contact_name: "Sam",
        emergency_contact_phone_primary: "5555550101",
        curp: null,
        ine_number: null,
        visa_number: null,
        passport_number: null,
      },
    ],
  }),
  // SM1: DriversListPage now composes the shared CreateDriverModal, which imports these from api/mdata.
  createDriver: vi.fn(),
  checkReturningDriver: vi.fn().mockResolvedValue({ returning_driver: false }),
}));

vi.mock("../../api/safety", () => ({
  listDriverQualificationItems: vi.fn().mockResolvedValue({ items: [] }),
  // DRIVER-DQF-KPI-PAGE-1-SILENT-TRUNCATION: the fleet-wide summary the KPI cards now read from.
  getDriverQualificationSummary: vi.fn().mockResolvedValue({ total: 1, compliant: 0, attention: 0, non_compliant: 0, empty: 1 }),
  // The shared Modal (pulled in via CreateDriverModal) reads/writes size prefs through api/safety.
  getUserPreferences: vi.fn().mockResolvedValue({ preferences: {} }),
  patchUserPreferences: vi.fn().mockResolvedValue({ preferences: {} }),
}));

// CreateDriverModal loads reference data on mount; keep these off the network in tests.
vi.mock("../../api/org", () => ({
  listMyCompanies: vi.fn().mockResolvedValue({ companies: [] }),
}));

vi.mock("../../api/catalogs", () => ({
  listUsStates: vi.fn().mockResolvedValue({ states: [] }),
  listMexicoStates: vi.fn().mockResolvedValue({ states: [] }),
}));

describe("DriversListPage", () => {
  it("renders fleet compliance summary and driver row", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <ToastProvider>
          <MemoryRouter>
            <DriversListPage />
          </MemoryRouter>
        </ToastProvider>
      </QueryClientProvider>
    );

    expect(await screen.findByText("Driver qualification profiles")).toBeInTheDocument();
    expect(await screen.findByText("Alex Rivera")).toBeInTheDocument();
    expect(await screen.findByText("No DQF items")).toBeInTheDocument();
  });
});
