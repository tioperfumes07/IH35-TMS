import { describe, expect, it } from "vitest";
import {
  DEFAULT_LUMPER_SCENARIO,
  chargeCustomerDefault,
  lumperMoneyEffect,
  reeferRequiresLumperDecision,
  scenarioToStopFields,
  stopFieldsToScenario,
} from "./book-load-lumper-scenario";

describe("book-load-lumper-scenario — STEP 6 money model (Jorge money-check: $3000 trip + $300 lumper)", () => {
  it("broker_direct is the default", () => {
    expect(DEFAULT_LUMPER_SCENARIO).toBe("broker_direct");
  });

  it("maps each scenario to (lumper_paid_by, lumper_billable)", () => {
    expect(scenarioToStopFields("broker_direct")).toEqual({ lumper_paid_by: "broker", lumper_billable: false });
    expect(scenarioToStopFields("carrier_bill")).toEqual({ lumper_paid_by: "carrier", lumper_billable: true });
    expect(scenarioToStopFields("carrier_absorb")).toEqual({ lumper_paid_by: "carrier", lumper_billable: false });
  });

  it("derives the scenario back from persisted fields", () => {
    expect(stopFieldsToScenario("broker", false)).toBe("broker_direct");
    expect(stopFieldsToScenario("carrier", true)).toBe("carrier_bill");
    expect(stopFieldsToScenario("carrier", false)).toBe("carrier_absorb");
    expect(stopFieldsToScenario("carrier", null)).toBe("carrier_absorb"); // null override → not billed
    expect(stopFieldsToScenario("shipper", true)).toBe("broker_direct"); // non-carrier → not our money
  });

  it("reefer requires a lumper Y/N decision", () => {
    expect(reeferRequiresLumperDecision({ temperature_type: "frozen" })).toBe(true);
    expect(reeferRequiresLumperDecision({ temperature_type: "fresh" })).toBe(true);
    expect(reeferRequiresLumperDecision({ requires_reefer_fuel: true })).toBe(true);
    expect(reeferRequiresLumperDecision({ reefer_temp_f: 34 })).toBe(true);
    expect(reeferRequiresLumperDecision({ temperature_type: "", reefer_temp_f: "" })).toBe(false);
    expect(reeferRequiresLumperDecision({})).toBe(false);
  });

  it("charge-customer default follows the customer billing mode", () => {
    expect(chargeCustomerDefault("itemized")).toBe(true);
    expect(chargeCustomerDefault("flat_rate_includes")).toBe(false);
    expect(chargeCustomerDefault(null)).toBe(true); // default = itemized
  });

  // ─── ACCEPTANCE worked examples (plain dollars; $300 lumper = 30000 cents) ───
  it("S1 broker/comcheck: invoice +$0, cost $0, driver $0, net $0 (passthrough)", () => {
    expect(lumperMoneyEffect("broker_direct", 30000, false)).toEqual({
      customer_invoice_cents: 0,
      carrier_cost_cents: 0,
      driver_settlement_cents: 0,
      net_to_carrier_cents: 0,
    });
  });

  it("S2 we-pay-bill (itemized): invoice +$300, cost $300, driver $0, net ~$0 (recovered)", () => {
    expect(lumperMoneyEffect("carrier_bill", 30000, false)).toEqual({
      customer_invoice_cents: 30000,
      carrier_cost_cents: 30000,
      driver_settlement_cents: 0,
      net_to_carrier_cents: 0,
    });
  });

  it("S2 we-pay-bill but FLAT-RATE customer: invoice +$0 (suppressed), cost $300, net -$300 (covered by flat rate)", () => {
    expect(lumperMoneyEffect("carrier_bill", 30000, true)).toEqual({
      customer_invoice_cents: 0,
      carrier_cost_cents: 30000,
      driver_settlement_cents: 0,
      net_to_carrier_cents: -30000,
    });
  });

  it("S3 absorb: invoice +$0, cost $300, driver $0, net -$300", () => {
    expect(lumperMoneyEffect("carrier_absorb", 30000, false)).toEqual({
      customer_invoice_cents: 0,
      carrier_cost_cents: 30000,
      driver_settlement_cents: 0,
      net_to_carrier_cents: -30000,
    });
  });

  it("never produces a negative charge (clamps garbage/negative amounts)", () => {
    expect(lumperMoneyEffect("carrier_bill", -500, false).customer_invoice_cents).toBe(0);
    expect(lumperMoneyEffect("carrier_bill", Number.NaN, false).carrier_cost_cents).toBe(0);
  });
});
