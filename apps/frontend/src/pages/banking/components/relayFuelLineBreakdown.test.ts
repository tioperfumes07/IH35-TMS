import { describe, expect, it } from "vitest";
import {
  buildRelayFuelBreakdown,
  formatRelayFuelBreakdownSummary,
  relayFuelTypeLabel,
} from "./relayFuelLineBreakdown";

describe("relayFuelLineBreakdown", () => {
  it("labels diesel / reefer / DEF distinctly", () => {
    expect(relayFuelTypeLabel({ fuel_type: "diesel" })).toBe("Diesel (truck)");
    expect(relayFuelTypeLabel({ fuel_type: "reefer" })).toBe("Diesel (reefer)");
    expect(relayFuelTypeLabel({ fuel_type: "def" })).toBe("DEF");
  });

  it("expands product lines + aggregates fuel fee (Relay $800 → breakdown)", () => {
    const rows = buildRelayFuelBreakdown([
      {
        line_index: 0,
        fuel_type: "diesel",
        total_discounted_price_cents: 60000,
        fee_type: "sender_fee",
        fee_amount_cents: 200,
        volume: "150",
        volume_uom: "gal",
      },
      {
        line_index: 1,
        fuel_type: "reefer",
        total_discounted_price_cents: 15000,
        fee_amount_cents: 0,
        volume: "40",
        volume_uom: "gal",
      },
      {
        line_index: 2,
        fuel_type: "def",
        total_discounted_price_cents: 4800,
        fee_amount_cents: 0,
      },
    ]);
    expect(rows.map((r) => r.label)).toEqual([
      "Diesel (truck)",
      "Diesel (reefer)",
      "DEF",
      "Fuel fee",
    ]);
    expect(rows.map((r) => r.amount_cents)).toEqual([60000, 15000, 4800, 200]);
  });

  it("formats a one-line summary for the register description", () => {
    const summary = formatRelayFuelBreakdownSummary(
      [{ fuel_type: "diesel", total_discounted_price_cents: 10000, fee_amount_cents: 200 }],
      (c) => `$${(c / 100).toFixed(2)}`,
    );
    expect(summary).toContain("Diesel (truck) $100.00");
    expect(summary).toContain("Fuel fee $2.00");
  });
});
