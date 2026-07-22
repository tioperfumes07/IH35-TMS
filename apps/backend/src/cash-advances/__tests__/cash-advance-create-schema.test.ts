import { describe, expect, it } from "vitest";
import { createCashAdvanceBodySchemaForTests as schema } from "../cash-advances.routes.js";

const DRIVER = "33333333-3333-4333-8333-333333333333";
const LOAD = "44444444-4444-4444-8444-444444444444";
const UNIT = "55555555-5555-4555-8555-555555555555";
const BANK = "66666666-6666-4666-8666-666666666666";

describe("POST /cash-advances create schema — wizard depth", () => {
  it("accepts personal full recovery with bank account (no schedule required)", () => {
    const parsed = schema.safeParse({
      driver_id: DRIVER,
      amount: 500,
      purpose: "family_emergency",
      disbursement_method: "direct_bank_transfer",
      from_bank_account_id: BANK,
      recovery_mode: "full",
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.recovery_mode).toBe("full");
      expect(parsed.data.load_id).toBeUndefined();
    }
  });

  it("requires from_bank_account_id for transfer", () => {
    const parsed = schema.safeParse({
      driver_id: DRIVER,
      amount: 100,
      purpose: "family_emergency",
      disbursement_method: "direct_bank_transfer",
      recovery_mode: "full",
    });
    expect(parsed.success).toBe(false);
  });

  it("requires load_id for lumper", () => {
    const bad = schema.safeParse({
      driver_id: DRIVER,
      amount: 150,
      purpose: "lumper",
      disbursement_method: "comdata",
    });
    expect(bad.success).toBe(false);

    const good = schema.safeParse({
      driver_id: DRIVER,
      amount: 150,
      purpose: "lumper",
      disbursement_method: "comdata",
      load_id: LOAD,
      unit_id: UNIT,
      economic_routing: "load_expense",
    });
    expect(good.success).toBe(true);
  });

  it("requires repayment_schedule when amortize", () => {
    const bad = schema.safeParse({
      driver_id: DRIVER,
      amount: 400,
      purpose: "family_emergency",
      disbursement_method: "wire",
      recovery_mode: "amortize",
    });
    expect(bad.success).toBe(false);

    const good = schema.safeParse({
      driver_id: DRIVER,
      amount: 400,
      purpose: "family_emergency",
      disbursement_method: "wire",
      recovery_mode: "amortize",
      repayment_schedule: { weekly_installment_amount: 100, total_periods: 4, cadence: "weekly" },
    });
    expect(good.success).toBe(true);
  });

  it("includes load_id + recovery_mode on payload", () => {
    const parsed = schema.safeParse({
      driver_id: DRIVER,
      amount: 200,
      purpose: "fuel_deposit",
      disbursement_method: "comdata",
      load_id: LOAD,
      unit_id: UNIT,
      recovery_mode: "amortize",
      repayment_schedule: { weekly_installment_amount: 50, total_periods: 4, cadence: "weekly" },
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.load_id).toBe(LOAD);
      expect(parsed.data.recovery_mode).toBe("amortize");
      expect(parsed.data.unit_id).toBe(UNIT);
    }
  });
});
