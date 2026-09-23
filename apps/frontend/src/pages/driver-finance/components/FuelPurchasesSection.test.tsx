import { render, screen } from "@testing-library/react";
import type { ReactElement } from "react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { FuelPurchasesSection } from "./FuelPurchasesSection";
import type { CompanySettlementFuelRow } from "../../../api/accounting";

// EntityLink (rendered for a row's Load # cell) uses react-router's Link — every row needs a router context.
function renderWithRouter(ui: ReactElement) {
  return render(<MemoryRouter>{ui}</MemoryRouter>);
}

// ROUND 83 RULING 3 / owner "item lines on screen" law (2026-09-23, ALL-SEATS FINISH ALL 13):
// "if the feed writes gallons x price-per-gallon and the screen shows a flat amount, he cannot
// verify day 1." This is the proof that the screen actually renders item · description · QTY ·
// RATE · AMOUNT, not just that the backend query returns the right columns.

function row(overrides: Partial<CompanySettlementFuelRow> = {}): CompanySettlementFuelRow {
  return {
    load_id: "load-1",
    load_number: "13609",
    transaction_date: "2026-09-21",
    vendor: "LOVES",
    location: "SHORTER, AL",
    invoice_number: null,
    fuel_type: "diesel",
    gallons: 115,
    price_per_gallon: 6.68,
    amount_cents: 68494,
    ...overrides,
  };
}

describe("FuelPurchasesSection — item lines, not a flat amount", () => {
  it("renders nothing when there are no fuel purchases (never an empty card)", () => {
    const { container } = renderWithRouter(<FuelPurchasesSection rows={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders diesel and DEF as two SEPARATE items, each with its own qty/rate/amount", () => {
    renderWithRouter(
      <FuelPurchasesSection
        rows={[
          row({ fuel_type: "diesel", gallons: 115, price_per_gallon: 6.68, amount_cents: 68494 }),
          row({ fuel_type: "def", gallons: 4.7, price_per_gallon: 4.89, amount_cents: 2298, load_number: "13613" }),
        ]}
      />
    );
    expect(screen.getByText("Fuel-Truck Diesel")).toBeInTheDocument();
    expect(screen.getByText("Fuel-DEF-Diesel Exhaust Fluid")).toBeInTheDocument();
    // Qty (gallons) — real numbers, not collapsed into one total.
    expect(screen.getByText("115.0")).toBeInTheDocument();
    expect(screen.getByText("4.7")).toBeInTheDocument();
    // Rate ($/gal) — the actual per-gallon price, not derived/rounded away.
    expect(screen.getByText("$6.6800")).toBeInTheDocument();
    expect(screen.getByText("$4.8900")).toBeInTheDocument();
    // Amount — the real charged amount.
    expect(screen.getByText("$684.94")).toBeInTheDocument();
    expect(screen.getByText("$22.98")).toBeInTheDocument();
  });

  it("a purchase with no captured gallons/price renders a dash, never a fake zero (LAW §8)", () => {
    renderWithRouter(<FuelPurchasesSection rows={[row({ gallons: null, price_per_gallon: null })]} />);
    const dashes = screen.getAllByText("—");
    expect(dashes.length).toBeGreaterThanOrEqual(2); // qty dash + rate dash
    expect(screen.queryByText("0.0")).not.toBeInTheDocument();
    expect(screen.queryByText("$0.0000")).not.toBeInTheDocument();
  });

  it("footer subtotal and gallons total sum every row, matching the real amounts (not the per-item display rounding)", () => {
    renderWithRouter(
      <FuelPurchasesSection
        rows={[
          row({ fuel_type: "diesel", gallons: 115, amount_cents: 68494 }),
          row({ fuel_type: "def", gallons: 4.7, amount_cents: 2298 }),
        ]}
      />
    );
    expect(screen.getByText(/Subtotal: \$707\.92/)).toBeInTheDocument();
    expect(screen.getByText(/Gallons: 119\.7/)).toBeInTheDocument();
  });

  it("an unrecognized fuel_type still renders (Title Case fallback), never drops the row silently", () => {
    renderWithRouter(<FuelPurchasesSection rows={[row({ fuel_type: "biodiesel" })]} />);
    expect(screen.getByText("Biodiesel")).toBeInTheDocument();
  });
});
