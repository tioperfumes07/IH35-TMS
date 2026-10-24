// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import type { CompanySettlementReport } from "../../../api/accounting";
import type { TourReadout } from "../../../api/tourReadout";
import { SettlementStatementDocument } from "./SettlementStatementDocument";

function report(overrides: Partial<CompanySettlementReport["sections"]> = {}): CompanySettlementReport {
  return {
    company_settlement_id: "cs-1",
    display_id: "5753",
    period_start: "2026-07-24",
    period_end: "2026-07-26",
    status: "open",
    driver_settlement_ids: ["ds-1"],
    sections: {
      customer_charges: {
        rows: [{ load_id: "l1", load_number: "13471", charge_code: "LH", description: "Line haul", amount_cents: 810000 }],
        total_cents: 810000,
      },
      driver_payment: {
        rows: [{ load_id: "l1", load_number: "13471", driver_id: "d1", driver_name: "Ada", line_type: "earnings", description: "Loaded miles", amount_cents: 189795 }],
        total_cents: 189795,
      },
      fuel_purchases: {
        rows: [{
          load_id: "l1",
          load_number: "13471",
          transaction_date: "2026-07-24",
          vendor: "Love's",
          location: "Tallulah, LA",
          invoice_number: "237",
          fuel_type: "diesel",
          gallons: 100.5,
          price_per_gallon: 3.5,
          amount_cents: 35175,
        }],
        total_cents: 35175,
        total_gallons: 100.5,
      },
      expenses: { rows: [], total_cents: 0 },
      revenue: { invoiced_cents: 810000 },
      pl_rollup: {
        lines: [{ line_type: "earnings", label: "Driver Salary", amount_cents: -189795 }],
        net_revenue_cents: 241511,
      },
      miles_and_mpg: { total_miles: 1000, mpg: 6.07 },
      ...overrides,
    },
  };
}

const readout = {
  legs: [{
    load_id: "l1",
    load_number: "13471",
    trip_type: "NB",
    status: "delivered",
    is_delivered: true,
    lane: "Camden, NJ → Houston, TX",
    pickup_city: "Camden, NJ",
    delivery_city: "Houston, TX",
    pickup_date: "2026-07-24",
    delivery_date: "2026-07-26",
    revenue_cents: 810000,
    costs_cents: 0,
    driver_pay_cents: 189795,
    margin_cents: 0,
    margin_pct: null,
    miles_practical: 1000,
    miles_shortest: null,
    miles_deadhead: null,
    miles_real: null,
    unit_id: "u1",
    unit_number: "T169",
    trailer_id: null,
    trailer_number: "TR1",
    pod_count: 0,
    cost_count: 0,
    is_this_load: true,
  }],
  driver_settlement: {
    lines: [
      { id: "escrow-1", line_type: "escrow_contribution", description: "Escrow", amount_cents: 5000, load_id: "l1", load_number: "13471", approval_status: null, posting_account_id: null, account_label: null, source_driver_bill_id: null },
    ],
    driver_bills: [],
    gross_cents: 189795,
    deductions_cents: 5000,
    reimbursements_cents: 0,
    net_cents: 184795,
    escrow_cents: 5000,
    recoveries_cents: 0,
    pdf_path: "",
  },
} as unknown as TourReadout;

describe("SettlementStatementDocument", () => {
  it("renders the eight sections from the company report and lists the escrow deduction on its load", () => {
    render(
      <MemoryRouter>
        <SettlementStatementDocument
          settlementNumber="5806"
          periodStart="2026-07-24"
          periodEnd="2026-07-24"
          readout={readout}
          companyReport={report()}
        />
      </MemoryRouter>,
    );
    expect(screen.getByTestId("settlement-document-header")).toHaveTextContent("5753");
    expect(screen.getByTestId("settlement-document-header")).toHaveTextContent("07/24/2026");
    expect(screen.getByTestId("settlement-document-header")).toHaveTextContent("07/26/2026");
    expect(screen.getByTestId("settlement-document-loads")).toHaveTextContent("13471");
    expect(screen.getByTestId("settlement-document-loads")).toHaveTextContent("Camden, NJ");
    expect(screen.getByTestId("settlement-document-loads")).toHaveTextContent("Houston, TX");
    expect(screen.getByTestId("settlement-document-loads")).toHaveTextContent("T169");
    expect(screen.getByTestId("settlement-document-fuel")).toHaveTextContent("Love's");
    expect(screen.getByTestId("settlement-document-fuel")).toHaveTextContent("237");
    expect(screen.getByTestId("settlement-document-deductions")).toHaveTextContent("Escrow");
    expect(screen.getByTestId("settlement-document-deductions")).not.toHaveTextContent("$0.00");
    expect(screen.getByTestId("settlement-document-pl")).toHaveTextContent("Driver Salary");
    expect(screen.getByTestId("settlement-document-pl")).toHaveTextContent("6.070");
  });

  it("says there are no deductions instead of a single zero line", () => {
    render(
      <MemoryRouter>
        <SettlementStatementDocument
          settlementNumber={null}
          periodStart={null}
          periodEnd={null}
          readout={{ ...readout, driver_settlement: { ...readout.driver_settlement!, lines: [] } }}
          companyReport={undefined}
        />
      </MemoryRouter>,
    );
    expect(screen.getByTestId("settlement-document-deductions")).toHaveTextContent("No deductions on this settlement.");
    expect(screen.getByTestId("settlement-document-fuel")).toHaveTextContent("Company settlement is not linked");
  });
});
