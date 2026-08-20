import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactElement } from "react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MaintenanceCostPerUnitResponse } from "../../api/reports";
import * as reportsApi from "../../api/reports";
import { MaintenanceCostPerUnitPage } from "./MaintenanceCostPerUnitPage";

vi.mock("../../contexts/CompanyContext", () => ({
  useCompanyContext: () => ({
    selectedCompanyId: "11111111-1111-1111-1111-111111111111",
    companies: [],
    selectedCompany: null,
    isLoading: false,
    setSelectedCompany: vi.fn(),
    setDefaultCompanyForUser: vi.fn(async () => {}),
  }),
}));

function wrap(ui: ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={qc}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>
  );
}

// Mirrors the real API payload shape from
// apps/backend/src/reports/maintenance-cost-per-unit.routes.ts (totals.total_*_cents,
// row miles_driven, by_category object map). Guard: verify:maint-cost-per-unit-field-bind.
const sample: MaintenanceCostPerUnitResponse = {
  period: { start: "2026-01-01", end: "2026-03-31" },
  basis: "accrual",
  include_roadservice: true,
  totals: {
    wo_count: 10,
    total_parts_cents: 100_000,
    total_labor_cents: 50_000,
    total_outsourced_cents: 25_000,
    grand_total_cents: 175_000,
    truck_count: 2,
  },
  by_truck: [
    {
      unit_id: "u1",
      unit_number: "T-100",
      wo_count: 4,
      parts_cents: 40_000,
      labor_cents: 10_000,
      outsourced_cents: 5_000,
      total_cents: 55_000,
      miles_driven: 1000,
      cost_per_mile_cents: 550,
      avg_wo_cents: 13_750,
      max_single_wo_cents: 30_000,
      flags: ["high_cost"],
    },
  ],
  by_category: {
    tire: 60_000,
    engine: 40_000,
  },
};

describe("MaintenanceCostPerUnitPage", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(reportsApi, "getMaintenanceCostPerUnit").mockResolvedValue(sample);
  });

  it("renders KPI totals and flag chips", async () => {
    render(wrap(<MaintenanceCostPerUnitPage />));
    await screen.findByText("Grand total");
    // LV-REPORTS-MAINT-COST-RAW-FLAG-TOKENS: the flag chip's title is the human display label now,
    // never the raw API token — "high_cost" stays on the wire/CSV export only (formatMaintCostFlagLabel).
    expect(screen.getByTitle("High cost")).toBeInTheDocument();
    await screen.findByText("By category");
  });

  it("binds KPI tiles to real API totals keys — dollar values, never $NaN", async () => {
    render(wrap(<MaintenanceCostPerUnitPage />));
    await screen.findByText("Grand total");
    expect(screen.getByText("$1,000.00")).toBeInTheDocument(); // Parts ← totals.total_parts_cents
    expect(screen.getByText("$500.00")).toBeInTheDocument(); // Labor ← totals.total_labor_cents
    expect(screen.getByText("$250.00")).toBeInTheDocument(); // Outsourced ← totals.total_outsourced_cents
    expect(screen.getByText("$1,750.00")).toBeInTheDocument(); // Grand total
    expect(document.body.textContent).not.toContain("NaN");
  });

  it("table sort toggles on Unit # header", async () => {
    const user = userEvent.setup();
    vi.spyOn(reportsApi, "getMaintenanceCostPerUnit").mockResolvedValue({
      ...sample,
      by_truck: [
        { ...sample.by_truck[0]!, unit_number: "T-B" },
        {
          unit_id: "u2",
          unit_number: "T-A",
          wo_count: 1,
          parts_cents: 1000,
          labor_cents: 0,
          outsourced_cents: 0,
          total_cents: 1000,
          miles_driven: 100,
          cost_per_mile_cents: 10,
          avg_wo_cents: 1000,
          max_single_wo_cents: 1000,
          flags: [],
        },
      ],
    });
    render(wrap(<MaintenanceCostPerUnitPage />));
    await screen.findByText("T-B");
    // Sortable headers render a <button> inside the <th>; the toggle lives on the button.
    const sortButton = screen.getAllByRole("button", { name: /Unit #/ }).find((el) => el.closest("th"));
    expect(sortButton).toBeDefined();

    // First click sorts ascending → T-A first.
    await user.click(sortButton!);
    await waitFor(() => {
      const tbody = screen.getByText("T-B").closest("tbody")!;
      expect(within(tbody).getAllByRole("row")[0]).toHaveTextContent("T-A");
    });

    // Second click toggles descending → T-B first.
    await user.click(sortButton!);
    await waitFor(() => {
      const tbody = screen.getByText("T-B").closest("tbody")!;
      expect(within(tbody).getAllByRole("row")[0]).toHaveTextContent("T-B");
    });
  });
});
