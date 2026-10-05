import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DriverProfilePage } from "./DriverProfilePage";
import { ToastProvider } from "../../components/Toast";
import * as clientApi from "../../api/client";
import { formatPhoneAsTyped } from "../../lib/formatPhoneAsTyped";
import { driverDisplayName } from "../../lib/driverDqf";

vi.mock("../../contexts/CompanyContext", () => ({
  useCompanyContext: () => ({ selectedCompanyId: "91f6d7d8-0f3a-4c2d-8e1b-2c3d4e5f6071" }),
}));

vi.mock("../../api/mdata", () => ({
  getDriver: vi.fn().mockResolvedValue({
    id: "d1",
    first_name: "Alex",
    last_name: "Rivera",
    status: "Active",
    phone: "5555550100",
    email: "alex@example.com",
    cdl_number: "TX123",
    cdl_state: "TX",
    cdl_expires_at: "2027-01-01",
    dot_medical_expires_at: "2026-12-01",
    settlement_auto_pay_enabled: false,
  }),
  updateDriver: vi.fn(),
  deactivateDriver: vi.fn(),
  reactivateDriver: vi.fn(),
}));

vi.mock("../../api/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../api/client")>();
  return { ...actual, apiRequest: vi.fn() };
});

vi.mock("../../api/safety", () => ({
  listDriverQualificationItems: vi.fn().mockResolvedValue({
    items: [{ id: "i1", driver_id: "d1", item_name: "MVR", status: "present", effective_date: null, expiry_date: null, notes: null }],
  }),
  createDriverQualificationItem: vi.fn(),
  patchDriverQualificationItem: vi.fn(),
  getUserPreferences: vi.fn().mockResolvedValue({}),
}));

vi.mock("../../api/requiredDocuments", () => ({
  listRequiredDocumentTypes: vi.fn().mockResolvedValue([]),
}));

// Heavy reverse / history panels — stub so the tab shell test stays focused (C-20).
vi.mock("./components/DriverDqfPanel", () => ({
  DriverDqfPanel: () => <div data-testid="driver-dqf-panel-stub">DQF checklist</div>,
}));
vi.mock("../../components/drivers/DriverLateArrivalCard", () => ({ DriverLateArrivalCard: () => null }));
vi.mock("../../components/driver-profile/DriverTeamsReverseSection", () => ({ DriverTeamsReverseSection: () => null }));
vi.mock("../../components/driver-profile/DriverTeamSplitConfigReverseSection", () => ({ DriverTeamSplitConfigReverseSection: () => null }));
vi.mock("../../components/safety/MedicalCardsHistorySection", () => ({ MedicalCardsHistorySection: () => null }));
vi.mock("../../components/boards/DriverOverviewBoard", () => ({
  DriverOverviewBoard: () => <div data-testid="driver-overview-board-stub" />,
}));
vi.mock("../../components/driver-profile/ActionBar", () => ({
  ActionBar: () => <div data-testid="dp-section-12-action-bar" />,
}));
vi.mock("../../components/driver-profile/CurrentAssignmentSection", () => ({
  CurrentAssignmentSection: () => <div data-testid="dp-section-6-assignment" />,
}));
vi.mock("../../components/driver-profile/PerformanceScorecardSection", () => ({
  PerformanceScorecardSection: () => <div data-testid="dp-section-7-performance" />,
}));
vi.mock("../../components/driver-profile/LicenseSection", () => ({
  LicenseSection: () => <div data-testid="dp-section-2-license" />,
}));
vi.mock("../../components/driver-profile/MedicalCardSection", () => ({
  MedicalCardSection: () => <div data-testid="dp-section-3-medical" />,
}));
vi.mock("../../components/driver-profile/DrugProgramSection", () => ({
  DrugProgramSection: () => <div data-testid="dp-section-4-drug" />,
}));
vi.mock("../../components/driver-profile/HOSStatusSection", () => ({
  HOSStatusSection: () => <div data-testid="dp-section-5-hos" />,
}));
vi.mock("../../components/driver-profile/SettlementsSection", () => ({
  SettlementsSection: () => <div data-testid="settlements-stub" />,
}));
vi.mock("../../components/driver-profile/DriverPaymentMethodsCard", () => ({ DriverPaymentMethodsCard: () => null }));
vi.mock("../../components/banking/LinkedBankTransactionsPanel", () => ({ LinkedBankTransactionsPanel: () => null }));
vi.mock("../../components/driver-profile/DriverSettlementFinanceReverseSection", () => ({ DriverSettlementFinanceReverseSection: () => null }));
vi.mock("../../components/driver-profile/DriverVendorMergesReverseSection", () => ({ DriverVendorMergesReverseSection: () => null }));
vi.mock("../../components/driver-profile/DriverAssignmentHistorySection", () => ({ DriverAssignmentHistorySection: () => null }));
vi.mock("../../components/driver-profile/DriverSamsaraDuplicateBanner", () => ({ DriverSamsaraDuplicateBanner: () => null }));
vi.mock("../../components/driver-profile/DriverProfileFuelVerdictsSection", () => ({ DriverProfileFuelVerdictsSection: () => null }));
vi.mock("../../components/driver-profile/DriverProfileSafetyAttributedSection", () => ({ DriverProfileSafetyAttributedSection: () => null }));
vi.mock("../../components/safety/ComplaintsReverseSection", () => ({ ComplaintsReverseSection: () => null }));
vi.mock("../../components/driver-profile/DriverProfileStopsMilesSection", () => ({
  DriverProfileStopsMilesSection: () => null,
}));
vi.mock("../../components/drivers/DriverIntegritySection", () => ({ DriverIntegritySection: () => null }));
vi.mock("../../api/driver-integrity", () => ({
  getDriverIntegrityProfile: vi.fn().mockResolvedValue(null),
  countedComplaints: () => 0,
}));

describe("DriverProfilePage", () => {
  afterEach(cleanup);

  beforeEach(() => {
    vi.mocked(clientApi.apiRequest).mockResolvedValue({
      driver: {
        id: "d1", first_name: "ALEX", last_name: "rivera", status: "Active",
        phone: "5555550100", email: "alex@example.com",
        cdl_number: "TX123", cdl_state: "TX",
        cdl_expires_at: "2027-01-01", dot_medical_expires_at: "2026-12-01",
        settlement_auto_pay_enabled: false,
      },
      license: { cdl_number: "TX123", class: "A", state: "TX", expiration: "2027-01-01", days_until_expiration: 200, restrictions: null, endorsements: { h: false, n: false, p: false, s: false, t: false, x: false } },
      medical_card: { expiration: "2027-06-01", days_until_expiration: 300, examiner: null, restrictions: null, color_status: "green" },
      drug_program: { in_random_pool: false, last_test: null, next_due_est: null },
      hos: { cycle_remaining_min: 3000, drive_remaining_min: 600, on_duty_remaining_min: 800, current_status: "off_duty", last_log_update_at: null, eld_device_status: "disconnected" },
      current_assignment: { default_truck: null, currently_driving_truck: null, current_load: null },
      performance_scorecard: { score: 90, total_events: 0, harsh_braking: 0, speeding: 0, distracted: 0, fleet_avg_score: 88, rank_in_fleet: 1 },
      settlements: { ytd_gross: 0, ytd_deductions: 0, ytd_net: 0, lifetime_with_company: 0, last_4_weeks: [] },
      training_records: [],
      border_credentials: { fast_card: {}, sentri: {}, twic: {}, passport: {}, mexican_license: {}, visa_b1: {} },
      documents: [],
    } as never);
  });

  it("C-12 Proper Case name + (area) phone mask helpers", () => {
    expect(driverDisplayName("ALEX", "rivera")).toBe("Alex Rivera");
    expect(formatPhoneAsTyped("5555550100")).toBe("(555) 555-0100");
  });

  it("renders tab strip before KPIs and Overview DQF sections (C-11/C-20)", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <ToastProvider>
          <MemoryRouter initialEntries={["/drivers/d1"]}>
            <Routes>
              <Route path="/drivers/:id" element={<DriverProfilePage />} />
            </Routes>
          </MemoryRouter>
        </ToastProvider>
      </QueryClientProvider>
    );

    expect(await screen.findByTestId("dp-tab-overview")).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Section navigation" })).toBeInTheDocument();
    expect(screen.getByTestId("driver-profile-kpi-strip")).toBeInTheDocument();
    expect(screen.getAllByRole("heading", { name: "Alex Rivera" }).length).toBeGreaterThan(0);
    expect(screen.getByTestId("driver-dqf-panel-stub")).toBeInTheDocument();
    expect(screen.getByText("Compliance summary")).toBeInTheDocument();
    expect(screen.getByTestId("driver-compliance-phone")).toHaveTextContent("(555) 555-0100");
  });

  it("opens Settlements from ?tab=settlements without Overview KPIs (C-20 A-13)", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <ToastProvider>
          <MemoryRouter initialEntries={["/drivers/d1?tab=settlements"]}>
            <Routes>
              <Route path="/drivers/:id" element={<DriverProfilePage />} />
            </Routes>
          </MemoryRouter>
        </ToastProvider>
      </QueryClientProvider>
    );

    expect(await screen.findByTestId("dp-tab-settlements")).toBeInTheDocument();
    expect(screen.queryByTestId("driver-profile-kpi-strip")).not.toBeInTheDocument();
    expect(screen.queryByTestId("dp-tab-overview")).not.toBeInTheDocument();
  });
});
