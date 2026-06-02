import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { DeadheadReportPage } from "../DeadheadReportPage";

vi.mock("../../../contexts/CompanyContext", () => ({
  useCompanyContext: () => ({ selectedCompanyId: "44444444-4444-4444-8444-444444444444", companies: [] }),
}));

vi.mock("../../../api/client", () => ({
  apiRequest: vi.fn(async () => ({
    period: { start: "2026-05-01", end: "2026-05-31", label: "last_4_weeks" },
    fleet: {
      avg_deadhead_pct: 14.2,
      total_deadhead_miles: 1200,
      total_miles: 8400,
      estimated_deadhead_cost_cents: 75600,
      truck_count: 3,
    },
    units: [
      {
        unit_id: "u1",
        unit_number: "T-7",
        week_starting: "2026-05-05",
        total_miles: 2800,
        loaded_miles: 2400,
        deadhead_miles: 400,
        deadhead_pct: 14.3,
        load_count: 6,
        fleet_avg_deadhead_pct: 14.2,
        rank_in_fleet: 2,
      },
    ],
  })),
}));

describe("DeadheadReportPage", () => {
  it("renders fleet overview and truck table", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <DeadheadReportPage />
        </MemoryRouter>
      </QueryClientProvider>
    );
    expect(await screen.findByText("Deadhead optimization")).toBeTruthy();
    expect(await screen.findByText("T-7")).toBeTruthy();
    expect(await screen.findByText("14.2%")).toBeTruthy();
  });
});
