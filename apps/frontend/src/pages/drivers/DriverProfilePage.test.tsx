import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DriverProfilePage } from "./DriverProfilePage";
import { ToastProvider } from "../../components/Toast";
import * as clientApi from "../../api/client";

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

describe("DriverProfilePage", () => {
  afterEach(cleanup);

  beforeEach(() => {
    vi.mocked(clientApi.apiRequest).mockResolvedValue({
      driver: {
        id: "d1", first_name: "Alex", last_name: "Rivera", status: "Active",
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

  it("renders driver DQF profile header and checklist section", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <ToastProvider>
          <MemoryRouter initialEntries={["/drivers/d1/profile"]}>
            <Routes>
              <Route path="/drivers/:id/profile" element={<DriverProfilePage />} />
            </Routes>
          </MemoryRouter>
        </ToastProvider>
      </QueryClientProvider>
    );

    const headings = await screen.findAllByRole("heading", { name: "Alex Rivera" });
    expect(headings.length).toBeGreaterThan(0);
    expect(screen.getByText("DQF checklist")).toBeInTheDocument();
    expect(screen.getByText("Compliance summary")).toBeInTheDocument();
  });
});
