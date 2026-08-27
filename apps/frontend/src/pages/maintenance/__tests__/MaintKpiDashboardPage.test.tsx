import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { MaintKpiDashboardPage } from "../MaintKpiDashboardPage";
import { pickDate } from "../../../test-utils/pickDate";

const getMaintenanceKpiSummary = vi.fn();
const getMaintenanceKpiDrilldown = vi.fn();
const getMaintenanceKpiPmCompliance = vi.fn();

vi.mock("../../../api/maintenance", () => ({
  getMaintenanceKpiSummary: (...args: unknown[]) => getMaintenanceKpiSummary(...args),
  getMaintenanceKpiDrilldown: (...args: unknown[]) => getMaintenanceKpiDrilldown(...args),
  getMaintenanceKpiPmCompliance: (...args: unknown[]) => getMaintenanceKpiPmCompliance(...args),
}));

vi.mock("../../../components/parity/EntityPicker", () => ({
  EntityPicker: ({ dataTestId }: { dataTestId?: string }) => <input data-testid={dataTestId} role="combobox" />,
}));

vi.mock("../../../contexts/CompanyContext", () => ({
  useCompanyContext: () => ({
    selectedCompanyId: "11111111-1111-4111-8111-111111111111",
    companies: [{ id: "11111111-1111-4111-8111-111111111111", name: "IH35" }],
  }),
}));

const summaryFixture = {
  period: { start: "2026-06-01", end: "2026-06-07" },
  unit_id: null,
  downtime_hours: 12.5,
  mtbf_hours: 96,
  cpm_cents: 42,
  cost_per_truck_cents: 125000,
  pm_compliance_pct: 88.5,
  sparklines: {
    downtime: [{ day: "2026-06-01", value: 2 }],
    mtbf: [{ day: "2026-06-01", value: 2 }],
    cpm: [{ day: "2026-06-01", value: 100 }],
    cost_per_truck: [{ day: "2026-06-01", value: 100 }],
    pm_compliance: [{ day: "2026-06-01", value: 88.5 }],
  },
};

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <MaintKpiDashboardPage />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("MaintKpiDashboardPage (B35)", () => {
  beforeEach(() => {
    getMaintenanceKpiSummary.mockReset();
    getMaintenanceKpiDrilldown.mockReset();
    getMaintenanceKpiPmCompliance.mockReset();
    getMaintenanceKpiSummary.mockResolvedValue(summaryFixture);
    getMaintenanceKpiDrilldown.mockResolvedValue({
      kind: "downtime",
      rows: [{ display_id: "WO-1", unit_number: "T-101", downtime_hours: 4 }],
    });
    getMaintenanceKpiPmCompliance.mockResolvedValue({
      rows: [{ schedule_label: "Oil", unit_number: "T-101", compliance_status: "compliant" }],
      total_count: 26,
      hub_links: { pm_auto_engine: "/maintenance/pm-auto-engine", pm_schedule: "/maintenance/pm-schedule" },
    });
  });

  it("renders maintenance KPI dashboard shell", async () => {
    renderPage();
    expect(await screen.findByTestId("maint-kpi-dashboard")).toBeInTheDocument();
    expect(screen.getByText("Maintenance KPI Dashboard")).toBeInTheDocument();
    expect(await screen.findByTestId("maint-kpi-tile-downtime")).toBeInTheDocument();
  });

  it("shows five KPI tiles with sparklines", async () => {
    renderPage();
    expect(await screen.findByTestId("maint-kpi-tile-mtbf")).toBeInTheDocument();
    expect(screen.getByTestId("maint-kpi-tile-cpm")).toBeInTheDocument();
    expect(screen.getByTestId("maint-kpi-tile-cost_per_truck")).toBeInTheDocument();
    expect(screen.getByTestId("maint-kpi-tile-pm_compliance")).toBeInTheDocument();
    expect(screen.getByTestId("maint-kpi-tile-downtime-sparkline")).toBeInTheDocument();
  });

  it("applies date filters and PM hub links", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByTestId("maint-kpi-dashboard");
    await user.click(screen.getByTestId("maint-kpi-filters-toggle"));
    await screen.findByTestId("maint-kpi-filter-start");
    // Third member of FE-TESTS-TYPE-INTO-DATEPICKER (#4882/#4886). The start filter is the shared DatePicker
    // — a button plus a calendar popover, with no editable input — so `clear()` threw
    // "clear() is only supported on editable elements" and the typing that followed never ran. Drive the real
    // control instead; the assertions below are about the KPI links, so the date is setup, not the subject.
    pickDate(screen.getByTestId("maint-kpi-filter-start"));
    expect(screen.getByTestId("maint-kpi-link-pm-engine")).toHaveAttribute("href", "/maintenance/pm-auto-engine");
    expect(screen.getByTestId("maint-kpi-link-pm-schedule")).toHaveAttribute("href", "/maintenance/pm-schedule");
  });

  it("uses the searchable unit picker for fleet filtering", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByTestId("maint-kpi-filters-toggle"));
    expect(screen.getByTestId("maint-kpi-filter-unit")).toHaveAttribute("role", "combobox");
  });

  it("requests and displays the exact PM-compliance server range", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByTestId("maint-kpi-tile-pm_compliance"));
    expect(await screen.findByTestId("maint-kpi-pm-server-pager")).toHaveTextContent("1–25 of 26");
    expect(getMaintenanceKpiPmCompliance).toHaveBeenCalledWith(
      "11111111-1111-4111-8111-111111111111",
      expect.any(String),
      expect.any(String),
      undefined,
      { limit: 25, offset: 0 }
    );
  });
});
