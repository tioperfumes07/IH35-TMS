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

const sample: MaintenanceCostPerUnitResponse = {
  period: { start: "2026-01-01", end: "2026-03-31" },
  totals: {
    wo_count: 10,
    parts_cents: 100_000,
    labor_cents: 50_000,
    outsourced_cents: 25_000,
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
      miles: 1000,
      cost_per_mile_cents: 550,
      flags: ["high_cost"],
    },
  ],
  by_category: [
    { category: "tire", amount_cents: 60_000 },
    { category: "engine", amount_cents: 40_000 },
  ],
};

describe("MaintenanceCostPerUnitPage", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(reportsApi, "getMaintenanceCostPerUnit").mockResolvedValue(sample);
  });

  it("renders KPI totals and flag chips", async () => {
    render(wrap(<MaintenanceCostPerUnitPage />));
    await screen.findByText("Grand total");
    expect(screen.getByTitle("high_cost")).toBeInTheDocument();
    await screen.findByText("By category");
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
          miles: 100,
          cost_per_mile_cents: 10,
          flags: [],
        },
      ],
    });
    render(wrap(<MaintenanceCostPerUnitPage />));
    await screen.findByText("T-B");
    const unitHeaders = screen.getAllByText("Unit #");
    const th = unitHeaders.find((el) => el.tagName === "TH");
    await user.click(th!);
    await user.click(th!);
    await waitFor(() => {
      const tbody = screen.getByText("T-B").closest("tbody")!;
      const firstRow = within(tbody).getAllByRole("row")[0];
      expect(firstRow).toHaveTextContent("T-A");
    });
  });
});
