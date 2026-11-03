import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { groupBy, pct, sumBy, weekStartIso } from "../reportBoardGroup";
import { REPORT_BOARDS } from "../reportBoardCatalog";

vi.mock("../../../../contexts/CompanyContext", () => ({
  useCompanyContext: () => ({ selectedCompanyId: "5c854333-6ea5-4faa-af31-67cb272fef80", companies: [] }),
}));

const loadRow = (id: string, n: string, pickup: string, rev: number, pay: number, miles: number, customer: string) => ({
  load_id: id, load_number: n, status: "delivered", trip_type: "NB", customer_id: customer, customer_name: `CUSTOMER ${customer}`,
  driver_id: "d1", driver_name: "HUGO GAYTAN", unit_id: "u1", unit_number: "T156", trailer_id: null, trailer_number: null,
  customer_po_number: null, customer_wo_number: null, origin_city: "Laredo", origin_state: "TX", destination_city: "Dallas",
  destination_state: "TX", pickup_date: pickup, delivery_date: pickup, miles_practical: miles, miles_shortest: null,
  miles_driven_actual: null, revenue_cents: rev, driver_pay_cents: pay, fuel_cents: 0, margin_cents: rev - pay,
  invoice_id: null, invoice_number: null, factoring_advance_id: null, factoring_display: null, factoring_status: null,
  settlement_number: null, settlement_id: null,
});

const getLoadsReport = vi.fn(async () => ({
  date_field: "pickup",
  period: { start: "2026-10-01", end: "2026-10-31" },
  totals: { load_count: 3, revenue_cents: 0, driver_pay_cents: 0, fuel_cents: 0, margin_cents: 0 },
  rows: [
    loadRow("l1", "13697", "2026-10-20", 350000, 49280, 1110, "c1"),
    loadRow("l2", "13696", "2026-10-22", 200000, 30000, 500, "c2"),
    loadRow("l3", "13680", "2026-10-13", 100000, 20000, 400, "c1"),
  ],
}));

const dsRow = (id: string, status: string, net: number, paid: string | null) => ({
  settlement_id: id, display_id: `P-${id}`, settlement_number: status === "closed" ? null : null, driver_id: "d1",
  driver_name: "ANGEL ALFONSO SOSA PEREZ", period_start: "2026-10-21", period_end: "2026-10-23", status,
  gross_cents: net + 3500, deductions_cents: 3500, advances_cents: 0, escrow_withheld_cents: 0, net_cents: net, load_count: 1,
  first_load_number: "13697", last_load_number: "13697", first_load_id: "l1", last_load_id: "l1", paid_at: paid,
});
const getDriverSettlementsReport = vi.fn(async () => ({
  period: { start: "2026-01-01", end: "2026-11-03" },
  pagination: { limit: 200, offset: 0, total: 3 },
  totals: { settlement_count: 3, gross_cents: 0, deductions_cents: 0, advances_cents: 0, escrow_withheld_cents: 0, net_cents: 0 },
  rows: [dsRow("0119", "closed", 45780, null), dsRow("0113", "closed", 141647, null), dsRow("0115", "open", 188359, null)],
}));

vi.mock("../../../../api/reports", async () => {
  const actual = await vi.importActual<typeof import("../../../../api/reports")>("../../../../api/reports");
  return { ...actual, getLoadsReport, getDriverSettlementsReport, getKpiSummary: vi.fn(), getFrequentlyRun: vi.fn() };
});

function wrap(node: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>{node}</MemoryRouter>
    </QueryClientProvider>
  );
}

describe("report board helpers", () => {
  it("weeks start Monday (board 'Week of 10/19')", () => {
    expect(weekStartIso("2026-10-23")).toBe("2026-10-19");
    expect(weekStartIso("2026-10-19")).toBe("2026-10-19");
    expect(weekStartIso("2026-10-25")).toBe("2026-10-19");
  });
  it("groups and sums", () => {
    const g = groupBy([{ k: "a", v: 1 }, { k: "b", v: 2 }, { k: "a", v: 3 }], (r) => r.k);
    expect(sumBy(g.get("a") ?? [], (r) => r.v)).toBe(4);
    expect(pct(1, 4)).toBe(25);
    expect(pct(1, 0)).toBeNull();
  });
  it("catalog lists the five report routes", () => {
    expect(REPORT_BOARDS.map((b) => b.href)).toEqual([
      "/reports/loads",
      "/reports/driver-settlements",
      "/reports/company-settlements",
      "/reports/customers",
      "/reports/vendors",
    ]);
  });
});

describe("LoadsReportBoard", () => {
  it("groups the report rows by pickup week and ties the totals", async () => {
    const { LoadsReportBoard } = await import("../LoadsReportBoard");
    wrap(<LoadsReportBoard />);
    expect(await screen.findByText("Week of 10/19/2026")).toBeTruthy();
    expect(screen.getByText("Week of 10/12/2026")).toBeTruthy();
    const kpis = screen.getByTestId("report-board-kpis");
    expect(within(kpis).getByText("$6,500.00")).toBeTruthy();
    expect(within(kpis).getByText("3")).toBeTruthy();
    expect(getLoadsReport).toHaveBeenCalledWith(expect.objectContaining({ operating_company_id: "5c854333-6ea5-4faa-af31-67cb272fef80", date_field: "pickup" }));
  });
});

describe("DriverSettlementsReportBoard", () => {
  it("shows closed-unpaid from the settlement paid stamp and proper-case driver names", async () => {
    const { DriverSettlementsReportBoard } = await import("../DriverSettlementsReportBoard");
    wrap(<DriverSettlementsReportBoard />);
    const tile = await screen.findByTestId("dsr-kpi-closed-unpaid");
    expect(await within(tile).findByText("$1,874.27")).toBeTruthy();
    expect(within(tile).getByText("2 settlements")).toBeTruthy();
    expect((await screen.findAllByText("Angel Alfonso Sosa Perez")).length).toBeGreaterThan(0);
  });
});
