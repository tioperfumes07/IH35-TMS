import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi, beforeEach } from "vitest";
import * as clientApi from "../../../api/client";
import * as mdataApi from "../../../api/mdata";
import * as safetyApi from "../../../api/safety";
import { DriverProfilePage } from "../DriverProfilePage";

vi.mock("../../../contexts/CompanyContext", () => ({
  useCompanyContext: () => ({ selectedCompanyId: "91f6d7d8-0f3a-4c2d-8e1b-2c3d4e5f6071" }),
}));

const driverFixture = {
  id: "d-test-1",
  first_name: "Jane",
  last_name: "Driver",
  status: "Active",
  phone: "+15555550100",
  cdl_number: "CDL123",
  cdl_state: "TX",
  cdl_expires_at: "2027-01-01",
  dot_medical_expires_at: "2027-06-01",
};

const profileFixture = {
  driver: driverFixture,
  license: {
    cdl_number: "CDL123",
    class: "A",
    state: "TX",
    expiration: "2027-01-01",
    days_until_expiration: 200,
    restrictions: null,
    endorsements: { h: true, n: false, p: false, s: true, t: true, x: false },
  },
  medical_card: { expiration: "2027-06-01", days_until_expiration: 300, examiner: null, restrictions: null, color_status: "green" },
  drug_program: { in_random_pool: true, last_test: { date: "2026-05-01", type: "random", result: "negative" }, next_due_est: null },
  hos: {
    cycle_remaining_min: 3000,
    drive_remaining_min: 600,
    on_duty_remaining_min: 800,
    current_status: "off_duty",
    last_log_update_at: "2026-06-01T12:00:00Z",
    eld_device_status: "connected",
  },
  current_assignment: { default_truck: null, currently_driving_truck: null, current_load: null },
  performance_scorecard: { score: 92, total_events: 3, harsh_braking: 1, speeding: 1, distracted: 1, fleet_avg_score: 88, rank_in_fleet: 2 },
  settlements: { ytd_gross: 100000, ytd_deductions: 10000, ytd_net: 90000, lifetime_with_company: 500000, last_4_weeks: [] },
  training_records: [],
  border_credentials: { fast_card: {}, sentri: {}, twic: {}, passport: {}, mexican_license: {}, visa_b1: {} },
  documents: [],
};

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={["/drivers/d-test-1/profile"]}>
        <Routes>
          <Route path="/drivers/:id/profile" element={<DriverProfilePage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("DriverProfilePage", () => {
  beforeEach(() => {
    vi.spyOn(mdataApi, "getDriver").mockResolvedValue(driverFixture as never);
    vi.spyOn(clientApi, "apiRequest").mockResolvedValue(profileFixture as never);
    vi.spyOn(safetyApi, "listDriverQualificationItems").mockResolvedValue({ items: [] } as never);
  });

  it("renders six profile sections", async () => {
    renderPage();
    expect(await screen.findByTestId("dp-section-1-identity")).toBeTruthy();
    expect(screen.getByTestId("dp-section-2-license")).toBeTruthy();
    expect(screen.getByTestId("dp-section-3-medical")).toBeTruthy();
    expect(screen.getByTestId("dp-section-4-drug")).toBeTruthy();
    expect(screen.getByTestId("dp-section-5-hos")).toBeTruthy();
    expect(screen.getByTestId("dp-section-6-assignment")).toBeTruthy();
  });

  it("renders part 2 profile sections", async () => {
    renderPage();
    expect(await screen.findByTestId("dp-section-7-performance")).toBeTruthy();
    expect(screen.getByTestId("dp-section-8-settlements")).toBeTruthy();
    expect(screen.getByTestId("dp-section-9-training")).toBeTruthy();
    expect(screen.getByTestId("dp-section-10-border")).toBeTruthy();
    expect(screen.getByTestId("dp-section-11-documents")).toBeTruthy();
    expect(screen.getByTestId("dp-section-12-action-bar")).toBeTruthy();
  });
});
