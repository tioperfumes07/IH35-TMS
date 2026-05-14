import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactElement } from "react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../../api/client";
import * as reportsApi from "../../api/reports";
import type { FuelReconciliationResponse } from "../../api/reports";
import { FuelReconciliationPage } from "./FuelReconciliationPage";

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

const sample: FuelReconciliationResponse = {
  period: { start: "2026-01-01", end: "2026-01-31" },
  totals: {
    card_amount_cents: 50_000,
    wo_amount_cents: 40_000,
    delta_cents: 10_000,
    match_rate_pct: 80,
    unmatched_count: 2,
  },
  by_truck: [
    {
      unit_id: "u-calm",
      unit_number: "T-Calm",
      card_amount_cents: 1000,
      wo_amount_cents: 1000,
      delta_cents: 20,
      matched_pct: 99,
      flags: [],
    },
    {
      unit_id: "u-hot",
      unit_number: "T-Hot",
      card_amount_cents: 1000,
      wo_amount_cents: 500,
      delta_cents: 200,
      matched_pct: 60,
      flags: ["unmatched"],
    },
  ],
  unmatched_card_transactions: [{ id: "c1", txn_date: "2026-01-05", amount_cents: 500, merchant: "FuelCo" }],
  unmatched_wo_entries: [] as {
    wo_id: string;
    wo_number: string;
    wo_date: string;
    amount_cents: number;
    unit_number: string;
  }[],
};

describe("FuelReconciliationPage", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(reportsApi, "getFuelReconciliation").mockResolvedValue(sample);
  });

  it("renders totals and flags; highlights suspicious delta row", async () => {
    render(wrap(<FuelReconciliationPage />));
    await screen.findByText("Fuel reconciliation");
    expect(await screen.findByText("T-Hot")).toBeInTheDocument();
    expect(screen.getByText("T-Hot").closest("tr")).toHaveClass("bg-red-50");
    expect(screen.getByTitle("unmatched")).toBeInTheDocument();
  });

  it("column header toggles sort order for unit numbers", async () => {
    const user = userEvent.setup();
    render(wrap(<FuelReconciliationPage />));
    await screen.findByText("T-Hot");
    const tbody = screen.getByText("T-Hot").closest("tbody")!;
    let first = within(tbody).getAllByRole("row")[0];
    expect(first).toHaveTextContent("T-Calm");
    await user.click(screen.getByText("Unit #"));
    await waitFor(() => {
      first = within(tbody).getAllByRole("row")[0];
      expect(first).toHaveTextContent("T-Hot");
    });
  });

  it("shows Block V placeholder on API error", async () => {
    vi.spyOn(reportsApi, "getFuelReconciliation").mockRejectedValue(new ApiError(404, {}));
    render(wrap(<FuelReconciliationPage />));
    expect(await screen.findByTestId("report-block-v-pending")).toBeInTheDocument();
  });

  it("manual match opens stub modal", async () => {
    const user = userEvent.setup();
    render(wrap(<FuelReconciliationPage />));
    await screen.findByText("FuelCo");
    await user.click(screen.getByRole("button", { name: /manual match/i }));
    expect(await screen.findByRole("heading", { name: /manual match/i })).toBeInTheDocument();
  });
});
