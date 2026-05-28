import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactElement } from "react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import * as reportsApi from "../../api/reports";
import { ProfitPerTruckPage } from "./ProfitPerTruckPage";

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
  BarChart: ({ children }: { children: React.ReactNode }) => <div data-testid="bar-chart">{children}</div>,
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

const samplePayload: reportsApi.ProfitPerTruckResponse = {
  period: { start: "2026-04-01", end: "2026-06-30" },
  totals: {
    revenue_cents: 1_000_000_00,
    driver_pay_cents: 400_000_00,
    fuel_cost_cents: 200_000_00,
    maintenance_cost_cents: 50_000_00,
    depreciation_cents: 40_000_00,
    other_direct_cost_cents: 10_000_00,
    net_profit_cents: 300_000_00,
    truck_count: 2,
  },
  by_truck: [
    {
      unit_id: "u1",
      unit_number: "101",
      truck_type: "Flatbed",
      revenue_cents: 600_000_00,
      driver_pay_cents: 200_000_00,
      fuel_cents: 100_000_00,
      maintenance_cents: 10_000_00,
      depreciation_cents: 20_000_00,
      other_cents: 5_000_00,
      net_profit_cents: 265_000_00,
      margin_pct: 44,
      load_count: 20,
      miles_driven: 40_000,
      revenue_per_mile_cents: 1500,
      cost_per_mile_cents: 850,
      profit_per_mile_cents: 650,
      primary_driver_id: "d1",
      primary_driver_name: "Pat Driver",
      flags: ["most_profitable"],
    },
    {
      unit_id: "u2",
      unit_number: "102",
      truck_type: "Van",
      revenue_cents: 400_000_00,
      driver_pay_cents: 200_000_00,
      fuel_cents: 100_000_00,
      maintenance_cents: 40_000_00,
      depreciation_cents: 20_000_00,
      other_cents: 5_000_00,
      net_profit_cents: 35_000_00,
      margin_pct: 10,
      load_count: 5,
      miles_driven: 10_000,
      revenue_per_mile_cents: 4000,
      cost_per_mile_cents: 3650,
      profit_per_mile_cents: 350,
      primary_driver_id: null,
      primary_driver_name: null,
      flags: ["least_profitable", "high_maintenance"],
    },
  ],
};

describe("ProfitPerTruckPage", () => {
  it("renders CPM dashboard header", async () => {
    vi.spyOn(reportsApi, "getProfitPerTruck").mockResolvedValue(samplePayload);
    render(wrap(<ProfitPerTruckPage />));
    expect(await screen.findByText("Per-truck CPM dashboard")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText("Fleet avg CPM")).toBeInTheDocument());
  });

  it("renders flag chips", async () => {
    vi.spyOn(reportsApi, "getProfitPerTruck").mockResolvedValue(samplePayload);
    render(wrap(<ProfitPerTruckPage />));
    await waitFor(() => expect(screen.getByText("101")).toBeInTheDocument());
    expect(screen.getByText(/most_profitable/i)).toBeInTheDocument();
    expect(screen.getByText(/high_maintenance/i)).toBeInTheDocument();
  });

  it("sorts when Miles header clicked", async () => {
    const user = userEvent.setup();
    vi.spyOn(reportsApi, "getProfitPerTruck").mockResolvedValue(samplePayload);
    render(wrap(<ProfitPerTruckPage />));
    await waitFor(() => expect(screen.getByText("101")).toBeInTheDocument());
    const table = screen.getByRole("table");
    await user.click(within(table).getByText("Miles"));
    await user.click(within(table).getByText("Miles"));
    const firstDataRow = within(table).getAllByRole("row")[1];
    expect(within(firstDataRow).getByText("102")).toBeInTheDocument();
  });

  it("navigates to asset financial tab on row click", async () => {
    const user = userEvent.setup();
    vi.spyOn(reportsApi, "getProfitPerTruck").mockResolvedValue(samplePayload);
    render(wrap(<ProfitPerTruckPage />));
    await waitFor(() => expect(screen.getByText("101")).toBeInTheDocument());
    await user.click(screen.getByText("101"));
    expect(mockNavigate).toHaveBeenCalledWith("/fleet/units/u1?tab=financial");
  });

  it("filters rows by search term", async () => {
    const user = userEvent.setup();
    vi.spyOn(reportsApi, "getProfitPerTruck").mockResolvedValue(samplePayload);
    render(wrap(<ProfitPerTruckPage />));
    await waitFor(() => expect(screen.getByText("101")).toBeInTheDocument());
    await user.type(screen.getByPlaceholderText("e.g. 102 or Pat"), "102");
    expect(screen.queryByText("101")).not.toBeInTheDocument();
    expect(screen.getByText("102")).toBeInTheDocument();
  });
});
