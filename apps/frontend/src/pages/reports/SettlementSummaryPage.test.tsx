import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactElement } from "react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import * as reportsApi from "../../api/reports";
import { SettlementSummaryPage } from "./SettlementSummaryPage";

const mockNavigate = vi.fn();

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return { ...actual, useNavigate: () => mockNavigate };
});

vi.mock("../../contexts/CompanyContext", () => ({
  useCompanyContext: () => ({ selectedCompanyId: "00000000-0000-4000-8000-000000000099" }),
}));

vi.mock("recharts", () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div data-testid="responsive-chart">{children}</div>,
  PieChart: ({ children }: { children: React.ReactNode }) => <div data-testid="pie-chart">{children}</div>,
  Pie: () => null,
  Cell: () => null,
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

const samplePayload: reportsApi.SettlementSummaryResponse = {
  period: { start: "2026-05-01", end: "2026-05-07" },
  totals: {
    gross_pay_cents: 100_000_00,
    deduction_total_cents: 10_000_00,
    chargeback_total_cents: 2_000_00,
    net_pay_cents: 88_000_00,
    settlement_count: 40,
    driver_count: 3,
  },
  by_deduction_type: { fuel_advance: 500_00, other: 200_00 },
  by_driver: [
    {
      driver_id: "d1",
      driver_name: "Alpha",
      gross_pay_cents: 60_000_00,
      deduction_cents: 5_000_00,
      chargeback_cents: 1_000_00,
      net_pay_cents: 54_000_00,
      load_count: 10,
      settlement_count: 5,
      avg_per_load_cents: 6_000_00,
      deductions_breakdown: {
        fuel_advance: 4_000_00,
        tire_damage: 500_00,
        escrow_contribution: 0,
        abandonment_chargeback: 0,
        other: 500_00,
      },
    },
    {
      driver_id: "d2",
      driver_name: "Bravo",
      gross_pay_cents: 40_000_00,
      deduction_cents: 5_000_00,
      chargeback_cents: 1_000_00,
      net_pay_cents: 34_000_00,
      load_count: 5,
      settlement_count: 4,
      avg_per_load_cents: 8_000_00,
      deductions_breakdown: {
        fuel_advance: 5_000_00,
        tire_damage: 0,
        escrow_contribution: 0,
        abandonment_chargeback: 0,
        other: 0,
      },
    },
  ],
};

describe("SettlementSummaryPage", () => {
  it("sorts drivers by name when Driver header toggles", async () => {
    const user = userEvent.setup();
    vi.spyOn(reportsApi, "getSettlementSummary").mockResolvedValue(samplePayload);
    render(wrap(<SettlementSummaryPage />));
    await waitFor(() => expect(screen.getByText("Alpha")).toBeInTheDocument());
    const table = screen.getByRole("table");
    const header = within(table).getByText("Driver");
    await user.click(header);
    const names = within(table)
      .getAllByRole("row")
      .slice(1)
      .map((r) => within(r).getAllByRole("cell")[0]?.textContent);
    expect(names[0]).toContain("Bravo");
  });

  it("expands deduction breakdown when Deductions cell clicked", async () => {
    const user = userEvent.setup();
    vi.spyOn(reportsApi, "getSettlementSummary").mockResolvedValue(samplePayload);
    render(wrap(<SettlementSummaryPage />));
    await waitFor(() => expect(screen.getByText("Alpha")).toBeInTheDocument());
    const dedCells = screen.getAllByText(/\$5,000\.00/);
    const dedLink = dedCells.find((el) => el.classList.contains("underline"));
    expect(dedLink).toBeTruthy();
    await user.click(dedLink!);
    await waitFor(() => expect(screen.getByText(/fuel_advance/i)).toBeInTheDocument());
  });

  it("navigates to driver settlements tab on row click", async () => {
    const user = userEvent.setup();
    vi.spyOn(reportsApi, "getSettlementSummary").mockResolvedValue(samplePayload);
    render(wrap(<SettlementSummaryPage />));
    await waitFor(() => expect(screen.getByText("Alpha")).toBeInTheDocument());
    await user.click(screen.getByText("Alpha"));
    expect(mockNavigate).toHaveBeenCalledWith("/drivers/d1?tab=settlements");
  });
});
