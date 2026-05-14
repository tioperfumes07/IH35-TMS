import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactElement } from "react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import * as reportsApi from "../../api/reports";
import { ApiError } from "../../api/client";
import { CashFlowOverviewPage } from "./CashFlowOverviewPage";

vi.mock("../../contexts/CompanyContext", () => ({
  useCompanyContext: () => ({ selectedCompanyId: "00000000-0000-4000-8000-000000000099" }),
}));

vi.mock("recharts", () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div data-testid="responsive-chart">{children}</div>,
  LineChart: ({ children }: { children: React.ReactNode }) => <div data-testid="line-chart">{children}</div>,
  BarChart: ({ children }: { children: React.ReactNode }) => <div data-testid="bar-chart">{children}</div>,
  Line: () => null,
  Area: () => null,
  Bar: () => null,
  XAxis: () => null,
  YAxis: () => null,
  CartesianGrid: () => null,
  Tooltip: () => null,
  Legend: () => null,
}));

function wrap(ui: ReactElement) {
  return (
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>
  );
}

const samplePayload: reportsApi.CashFlowOverviewResponse = {
  as_of_date: "2026-05-01",
  current_state: {
    operating_balance_cents: 1_000_00,
    dip_balance_cents: 50_000_00,
    payroll_balance_cents: 75_000_00,
    factoring_reserves_held_cents: 20_000_00,
    factoring_advances_funded_mtd_cents: 500_000_00,
    uncategorized_transactions_count: 2,
    chargebacks_open_cents: 1_200_00,
  },
  next_30_days: {
    expected_ar_collections_cents: 300_000_00,
    expected_ap_outflows_cents: 150_000_00,
    expected_settlement_outflows_cents: 100_000_00,
    net_projected_change_cents: 50_000_00,
  },
  historical: {
    last_7_days_inflows_cents: 80_000_00,
    last_7_days_outflows_cents: 70_000_00,
    last_30_days_avg_daily_inflow_cents: 10_000_00,
    last_30_days_avg_daily_outflow_cents: 9_000_00,
  },
};

describe("CashFlowOverviewPage", () => {
  it("renders KPI labels and projection chart shell when API succeeds", async () => {
    vi.spyOn(reportsApi, "getCashFlowOverview").mockResolvedValue(samplePayload);
    render(wrap(<CashFlowOverviewPage />));
    await waitFor(() => expect(screen.getByText("Operating balance")).toBeInTheDocument());
    expect(screen.getByText(/Cash flow overview/i)).toBeInTheDocument();
    expect(screen.getAllByTestId("line-chart").length).toBeGreaterThanOrEqual(1);
  });

  it("shows Block T pending banner on API error with retry", async () => {
    const user = userEvent.setup();
    const spy = vi.spyOn(reportsApi, "getCashFlowOverview").mockRejectedValue(new ApiError(404, { message: "nope" }));
    render(wrap(<CashFlowOverviewPage />));
    await waitFor(() => expect(screen.getByTestId("report-block-t-pending")).toBeInTheDocument());
    expect(screen.getByText(/Block T \(P6-T11197\) in flight/i)).toBeInTheDocument();
    spy.mockResolvedValue(samplePayload);
    await user.click(screen.getByRole("button", { name: /retry/i }));
    await waitFor(() => expect(screen.getByText("Operating balance")).toBeInTheDocument());
  });
});
