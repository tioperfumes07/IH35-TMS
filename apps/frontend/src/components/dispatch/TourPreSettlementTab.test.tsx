// @vitest-environment jsdom
import * as jestDomMatchers from "@testing-library/jest-dom/matchers";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { TourSettlementTab } from "./TourSettlementTab";
import { TourPreSettlementTab } from "./TourPreSettlementTab";

expect.extend(jestDomMatchers);

const mockGetTourReadoutForLoad = vi.fn();
vi.mock("../../api/tourReadout", () => ({
  getTourReadoutForLoad: (...args: unknown[]) => mockGetTourReadoutForLoad(...args),
  getTourReadout: vi.fn(),
  closeTour: vi.fn(),
}));

vi.mock("../Toast", () => ({ useToast: () => ({ pushToast: vi.fn() }) }));

function renderTab() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <TourPreSettlementTab loadId="load-1" operatingCompanyId="co-1" />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

// REG-033(b): the pre-settlement inside a load view must be clearly scoped to THIS tour's own
// settlement number AND dates — not a generic, dateless "Settlements" panel.
describe("REG-033(b) — pre-settlement is scoped to this tour's number and dates", () => {
  it("shows the settlement number and the tour period dates + per-leg dates", async () => {
    mockGetTourReadoutForLoad.mockResolvedValue({
      tour: {
        settlement_id: "set-1", display_id: "S-2026-0007", source_document_ref: "5804", status: "open", approval_status: null,
        settlement_model: null, tour_id: "tour-1", driver_id: "drv-1", driver_name: "Driver One",
        unit_number: "T177", trip_started_at: "2026-09-01T00:00:00.000Z", trip_closed_at: null,
        period_start: "2026-09-01", period_end: "2026-09-08", is_open: true, locked_at: null, paid_at: null,
      },
      legs: [
        {
          load_id: "load-1", load_number: "13571", trip_type: "NB", status: "delivered", is_delivered: true,
          lane: "Laredo TX → Edison NJ", pickup_city: "Laredo", delivery_city: "Edison",
          pickup_date: "2026-09-01", delivery_date: "2026-09-05",
          revenue_cents: 490000, costs_cents: 0, driver_pay_cents: 82274, margin_cents: 407726, margin_pct: 83.2,
          miles_practical: 1000, miles_shortest: 1000, miles_deadhead: 0, miles_real: null,
          pod_count: 1, cost_count: 0, is_this_load: true,
        },
      ],
      totals: { revenue_cents: 490000, costs_cents: 0, driver_pay_cents: 82274, margin_cents: 407726, margin_pct: 83.2, miles_practical: 1000, miles_real: null, per_mile_practical_cents: null, per_mile_real_cents: null },
      costs: [], ready: [], can_close: false, close_blockers: [], soft_warnings: [],
    });

    renderTab();

    // The tour's own settlement number is present (not a generic "Settlements"). ACCT-F20260911 +
    // INSTANT PRE-SETTLEMENT NUMBER (owner 2026-09-11): the number rendered is the AllwaysTrack doc
    // (source_document_ref), minted the instant the tour opens — NEVER the retired S-YYYY-NNNN display_id.
    expect(await screen.findByText("5804")).toBeInTheDocument();
    expect(screen.queryByText("S-2026-0007")).not.toBeInTheDocument();
    // The tour period dates are shown, scoped to THIS tour.
    const dates = await screen.findByTestId("tour-presettlement-dates");
    expect(dates).toHaveTextContent("09/01/2026");
    expect(dates).toHaveTextContent("09/08/2026");
    // Per-leg dates render in the legs table.
    const leg = screen.getByTestId("tour-leg");
    const pickup = within(leg).getByText("09/01/2026").closest("td");
    expect(pickup).not.toHaveTextContent("09/05/2026");
    expect(within(leg).getByText("09/05/2026").closest("td")).not.toBe(pickup);
    expect(within(leg).getByTestId("tour-leg-margin-pct").closest("td")).not.toHaveTextContent("$4,077.26");
  });
});


describe("REG-010/011 settlement detail grid", () => {
  it("keeps driver loaded and empty miles, rates and pay in individual columns", async () => {
    mockGetTourReadoutForLoad.mockResolvedValue({
      tour: { settlement_id: "s1", display_id: "S-2026-0042", is_open: false, status: "closed" },
      legs: [], costs: [], totals: {margin_pct: 10},
      driver_settlement: { gross_cents: 60000, net_cents: 60000, escrow_cents: 0, recoveries_cents: 0, lines: [], pdf_path: "/pdf", driver_bills: [
        {id: "bill-1",load_id: "load-1",load_number: "13508",miles_basis: 1000,rate_per_mile_cents: 45, loaded_pay_cents:45000,miles_deadhead:100,rate_empty_per_mile_cents:40,deadhead_pay_cents:4000,gross_amount_cents:49000},
      ] },
      company_settlement: { factoring: {factored_invoices:0}, margin_cents:1000 },
    });
    const qc = new QueryClient({defaultOptions:{queries:{retry:false}}});
    render(<QueryClientProvider client={qc}><MemoryRouter><TourSettlementTab loadId="load-1" operatingCompanyId="co-1" /></MemoryRouter></QueryClientProvider>);
    const table = await screen.findByTestId("settlement-driver-bills");
    for (const label of ["Loaded miles", "Loaded rate", "Loaded pay", "Empty miles", "Empty rate", "Empty pay", "Load Number"]) {
      expect(within(table).getByRole("columnheader", {name:new RegExp(label,"i")})).toBeInTheDocument();
    }
    expect(within(table).getByText("1,000.0").closest("td")).not.toHaveTextContent("$0.4500");
    expect(table).not.toHaveTextContent("×");
  });
});
