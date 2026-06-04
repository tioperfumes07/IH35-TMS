import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi, beforeEach } from "vitest";
import * as accountingApi from "../../api/accounting";
import * as clientApi from "../../api/client";
import * as mdataApi from "../../api/mdata";
import { ToastProvider } from "../../components/Toast";
import { VehicleProfilePage } from "../fleet/VehicleProfilePage";

vi.mock("../../contexts/CompanyContext", () => ({
  useCompanyContext: () => ({ selectedCompanyId: "91f6d7d8-0f3a-4c2d-8e1b-2c3d4e5f6071" }),
}));

vi.mock("../../components/forms/QboCombobox", () => ({
  QboCombobox: () => <div data-testid="qbo-vendor-combobox" />,
}));

vi.mock("../../components/maintenance/ServiceTimeline", () => ({
  ServiceTimeline: () => <div data-testid="service-timeline" />,
}));

const profileFixture = {
  unit: { id: "unit-test-1", unit_number: "T-501", vin: "VIN1", status: "InService", quick_availability: null },
  plates: [],
  samsara: null,
  latest_position: null,
  default_driver: { id: "d1", name: "John Smith", phone: "555-0100" },
  current_driver: { id: "d2", name: "Maria Garcia", phone: "555-0200", source: "samsara_webhook", logged_in_at: "2026-06-01T08:14:00Z" },
  current_load: null,
  open_wo_count: { in_house: 1, external: 0, roadside: 0, total: 1 },
  next_pm_due: { oil: { miles_remaining: 1200, due_date_est: null, last_done_odometer: 100000 } },
  last_service: null,
  compliance: { us_insurance: { expiration: null, days_until_expiration: null, color: "gray" }, mx_insurance: { color: "gray" }, registration_plates: [] },
  maintenance_alerts: [{ severity: "medium", message: "PM due soon", source: "maintenance", created_at: "2026-06-01T00:00:00Z" }],
  reefer: null,
  financial_ytd: {
    revenue_cents: 100000,
    total_operating_cost_cents: 60000,
    gross_profit_cents: 40000,
    profit_per_mile_cents: 120,
    profit_per_day_cents: 500,
    utilization_pct: 72,
    fleet_avg: { revenue_cents: 90000, cost_cents: 55000, profit_per_mile_cents: 100 },
    period: "YTD",
  },
  recent_activity: { loads: [], status_changes: [], work_orders: [] },
  photos: [],
  documents: [],
  total_ownership_cost: { purchase_price_cents: 5000000, total_cost_to_date_cents: 8000000, months_owned: 24, cost_per_month_cents: 333333 },
  comparable_metrics: {
    fleet_avg_maintenance_per_mile_cents: 15,
    this_unit_maintenance_per_mile_cents: 20,
    deviation_pct: 20,
    rank_in_fleet: 5,
    total_units_in_fleet: 10,
  },
};

vi.mock("../../api/client", () => ({
  apiRequest: vi.fn(),
}));

vi.mock("../../api/mdata", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../api/mdata")>();
  return {
    ...actual,
    patchUnit: vi.fn(),
  };
});

vi.mock("../../api/accounting", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../api/accounting")>();
  return {
    ...actual,
    listClassesForJe: vi.fn(),
  };
});

function wrap(ui: ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={qc}>
      <ToastProvider>
        <MemoryRouter initialEntries={["/fleet/units/unit-test-1"]}>
          <Routes>
            <Route path="/fleet/units/:id" element={ui} />
          </Routes>
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>
  );
}

describe("VehicleProfilePage", () => {
  beforeEach(() => {
    vi.mocked(clientApi.apiRequest).mockResolvedValue(profileFixture);
    vi.mocked(mdataApi.patchUnit).mockResolvedValue(profileFixture.unit);
    vi.mocked(accountingApi.listClassesForJe).mockResolvedValue({ classes: [] });
  });

  it("renders all eleven profile sections", async () => {
    render(wrap(<VehicleProfilePage />));
    expect(await screen.findByTestId("vp-section-1-identity")).toBeInTheDocument();
    expect(screen.getByTestId("vp-section-2-telemetry")).toBeInTheDocument();
    expect(screen.getByTestId("vp-section-3-driver")).toBeInTheDocument();
    expect(screen.getByTestId("vp-section-4-load")).toBeInTheDocument();
    expect(screen.getByTestId("vp-section-5-maintenance")).toBeInTheDocument();
    expect(screen.getByTestId("vp-section-6-compliance")).toBeInTheDocument();
    expect(screen.getByTestId("vp-section-7-reefer")).toBeInTheDocument();
    expect(screen.getByTestId("vp-section-8-financial")).toBeInTheDocument();
    expect(screen.getByTestId("vp-section-9-activity")).toBeInTheDocument();
    expect(screen.getByTestId("vp-section-10-documents")).toBeInTheDocument();
    expect(screen.getByTestId("vp-section-11-action-bar")).toBeInTheDocument();
  });

  it("shows comparable banner when deviation above 15%", async () => {
    render(wrap(<VehicleProfilePage />));
    expect(await screen.findByTestId("vp-comparable-banner")).toBeInTheDocument();
  });

  it("exports PDF link on action bar", async () => {
    render(wrap(<VehicleProfilePage />));
    const link = await screen.findByTestId("vp-export-pdf");
    expect(link.getAttribute("href")).toContain("export.pdf");
  });

  it("shows maintenance alerts banner when alerts present", async () => {
    render(wrap(<VehicleProfilePage />));
    expect(await screen.findByTestId("vp-maintenance-alerts-banner")).toBeInTheDocument();
    expect(screen.getByText(/PM due soon/)).toBeInTheDocument();
  });

  it("warns when default and current drivers differ", async () => {
    render(wrap(<VehicleProfilePage />));
    expect(await screen.findByText(/differs from currently driving/i)).toBeInTheDocument();
  });

  it("opens status modal when changing to OOS", async () => {
    render(wrap(<VehicleProfilePage />));
    await screen.findByText(/Unit T-501/);
    const select = screen.getByDisplayValue("InService");
    fireEvent.change(select, { target: { value: "OutOfService" } });
    expect(await screen.findByTestId("vp-status-change-modal")).toBeInTheDocument();
  });
});
