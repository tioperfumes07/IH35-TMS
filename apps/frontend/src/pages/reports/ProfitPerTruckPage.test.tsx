import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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
    // LV-REPORTS-PROFIT-PER-TRUCK-RAW-FLAG-TOKENS (already shipped): chips paint the human label
    // ("Most profitable"/"High maintenance"), never the raw API token -- assert the real rendered text.
    vi.spyOn(reportsApi, "getProfitPerTruck").mockResolvedValue(samplePayload);
    render(wrap(<ProfitPerTruckPage />));
    await waitFor(() => expect(screen.getByText("101")).toBeInTheDocument());
    expect(screen.getByText("Most profitable")).toBeInTheDocument();
    expect(screen.getByText("High maintenance")).toBeInTheDocument();
  });

  it("sorts when Miles header clicked", async () => {
    const user = userEvent.setup();
    vi.spyOn(reportsApi, "getProfitPerTruck").mockResolvedValue(samplePayload);
    render(wrap(<ProfitPerTruckPage />));
    await waitFor(() => expect(screen.getByText("101")).toBeInTheDocument());
    const table = screen.getByRole("table");
    // ParityTable appends a ▲/▼ to the ACTIVE sort header, so after the first click the header text is
    // "Miles▲" and a second exact `getByText("Miles")` no longer matches — which is why clicking twice
    // failed while clicking once worked. Target the button by accessible name anchored at the start, so
    // the assertion survives the arrow instead of depending on the sort being off.
    const milesHeader = () => within(table).getByRole("button", { name: /^Miles/ });
    const firstRow = () => within(table).getAllByRole("row")[1];

    // ParityTable.toggleSort: a NEW key sorts ASC, clicking the ACTIVE key flips to DESC. The page passes
    // no initial sortKey, so click 1 = asc and click 2 = desc. This previously clicked twice and asserted
    // the ASC winner (102, 10k miles), which only holds after ONE click — it was asserting the state it
    // had already toggled past. Assert BOTH directions instead: that proves the toggle, and unlike a
    // single expectation it cannot be satisfied by a sort that is stuck.
    await user.click(milesHeader());
    expect(within(firstRow()).getByText("102")).toBeInTheDocument(); // asc — 10,000 mi

    await user.click(milesHeader());
    expect(within(firstRow()).getByText("101")).toBeInTheDocument(); // desc — 40,000 mi
  });

  it("navigates to asset financial tab on row click", async () => {
    // LINK-F5118 (already shipped): the unit_number cell is its own EntityLink with
    // onClick={stopPropagation} so it can forward-drill to the unit page without also firing the
    // row's own onRowClick -- click a non-link cell (Type) instead, which still bubbles to the row.
    const user = userEvent.setup();
    vi.spyOn(reportsApi, "getProfitPerTruck").mockResolvedValue(samplePayload);
    render(wrap(<ProfitPerTruckPage />));
    await waitFor(() => expect(screen.getByText("101")).toBeInTheDocument());
    await user.click(screen.getByText("Flatbed"));
    expect(mockNavigate).toHaveBeenCalledWith("/fleet/units/u1?tab=financial");
  });

  it("filters rows by search term", async () => {
    // RPT-F3488 (already shipped): the page-local search input was removed as a duplicate of
    // ParityTable's own toolbar search, which now owns free-text search (default "Search rows…"
    // placeholder). fireEvent.change fires the native "change" event, which TableSearch flushes
    // immediately -- matching ParityTable.test.tsx's own established convention for this control;
    // user.type fires "input" events, which TableSearch debounces (EMIT_MS=300) before emitting.
    vi.spyOn(reportsApi, "getProfitPerTruck").mockResolvedValue(samplePayload);
    render(wrap(<ProfitPerTruckPage />));
    await waitFor(() => expect(screen.getByText("101")).toBeInTheDocument());
    fireEvent.change(screen.getByPlaceholderText("Search rows…"), { target: { value: "102" } });
    expect(screen.queryByText("101")).not.toBeInTheDocument();
    expect(screen.getByText("102")).toBeInTheDocument();
  });
});
