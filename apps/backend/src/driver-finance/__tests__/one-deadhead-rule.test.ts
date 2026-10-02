import { describe, expect, it } from "vitest";
import { deadheadPayCents, deadheadRateCents } from "../deadhead-rule.js";
import { creatorEmptyPayCents } from "../settlement-creator-empty-pay.js";
import { toLoadBlock } from "../batch-settlements.service.js";

describe("ROUND 288.3 item 2 — one deadhead rule: driver bill = settlement", () => {
  it("empty rate when set, else the loaded rate, else unpriced", () => {
    expect(deadheadRateCents({ emptyRateCents: 40, loadedRateCents: 45 })).toBe(40);
    expect(deadheadRateCents({ emptyRateCents: null, loadedRateCents: 45 })).toBe(45);
    expect(deadheadRateCents({ emptyRateCents: 0, loadedRateCents: null })).toBeNull();
    expect(deadheadPayCents(212.4, 45)).toBe(9558);
  });

  it("batch pay builds the settlement from the driver bill: loaded pay + deadhead = bill total (never the customer total)", () => {
    // Driver bill: 1,000 loaded mi @ 45c = 45,000c; 212.4 empty mi @ 45c (no empty rate on the card) = 9,558c.
    const bill = { loaded: 45_000, deadheadMiles: 212.4, emptyRate: 45 };
    const billTotal = bill.loaded + deadheadPayCents(bill.deadheadMiles, deadheadRateCents({ emptyRateCents: bill.emptyRate, loadedRateCents: 45 }));
    const block = toLoadBlock({
      load_id: "L1", load_number: "13631", customer_id: null, customer_name: "ACME", unit_id: null, unit_number: null, trailer_id: null,
      trip_type: "NB", status: "delivered", pickup_date: "2026-09-01", delivery_date: "2026-09-03", pickup_city: null, delivery_city: null,
      miles_practical: 1100, loaded_miles: 1000, empty_miles: null, rate_total_cents: 380_000, driver_pay_rate_per_mile: null,
      presettlement_link_id: "P", already_on_closed_settlement: false,
      bill_loaded_pay_cents: bill.loaded, bill_rate_per_mile_cents: 45, bill_miles_basis: 1000, bill_miles_deadhead: bill.deadheadMiles, bill_rate_empty_per_mile_cents: bill.emptyRate,
    } as never);
    expect(block.line_haul_amount_cents).toBe(45_000); // the bill's loaded pay — not the customer's 380,000
    const settlementTotal = (block.line_haul_amount_cents ?? 0) + creatorEmptyPayCents(block);
    expect(settlementTotal).toBe(billTotal);
    expect(settlementTotal).toBe(54_558);
  });
});
