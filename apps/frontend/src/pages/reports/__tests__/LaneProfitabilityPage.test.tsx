import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { LaneProfitabilityPage } from "../LaneProfitabilityPage";

vi.mock("../../../contexts/CompanyContext", () => ({
  useCompanyContext: () => ({ selectedCompanyId: "44444444-4444-4444-8444-444444444444", companies: [] }),
}));

vi.mock("../../../api/reports", () => ({
  getLaneProfitability: vi.fn(async () => ({
    period: { start: "2026-01-01", end: "2026-05-31", label: "YTD" },
    totals: { load_count: 12, total_revenue_cents: 1200000, gross_profit_cents: 300000, lane_count: 2 },
    most_profitable_lane: {
      origin_city: "Laredo",
      origin_state: "TX",
      destination_city: "Dallas",
      destination_state: "TX",
      load_count: 8,
      total_revenue_cents: 900000,
      total_fuel_cost_cents: 100000,
      total_driver_pay_cents: 300000,
      total_maintenance_cost_cents: 20000,
      total_miles: 4000,
      gross_profit_cents: 480000,
      profit_per_mile_cents: 120,
      profit_per_load_cents: 60000,
      margin_pct: 53.3,
      avg_deadhead_pct: 8.5,
      last_load_date: "2026-05-20",
    },
    least_profitable_lane: {
      origin_city: "Laredo",
      origin_state: "TX",
      destination_city: "Houston",
      destination_state: "TX",
      load_count: 4,
      total_revenue_cents: 300000,
      total_fuel_cost_cents: 50000,
      total_driver_pay_cents: 150000,
      total_maintenance_cost_cents: 10000,
      total_miles: 1200,
      gross_profit_cents: 90000,
      profit_per_mile_cents: 75,
      profit_per_load_cents: 22500,
      margin_pct: 30,
      avg_deadhead_pct: 12,
      last_load_date: "2026-05-10",
    },
    lanes: [],
    source: "cache",
    computed_at: "2026-06-02T12:00:00.000Z",
  })),
  getLaneProfitabilityLoads: vi.fn(async () => []),
}));

describe("LaneProfitabilityPage", () => {
  it("renders summary cards and lane table shell", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <LaneProfitabilityPage />
        </MemoryRouter>
      </QueryClientProvider>
    );

    expect(await screen.findByText("Lane profitability")).toBeTruthy();
    expect(screen.getByText("Total loads")).toBeTruthy();
    expect(screen.getByText("Most profitable lane")).toBeTruthy();
    expect(screen.getByText("Export CSV")).toBeTruthy();
  });
});
