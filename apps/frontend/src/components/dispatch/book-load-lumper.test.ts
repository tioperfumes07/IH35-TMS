import { describe, expect, it } from "vitest";
import {
  LUMPER_REIMBURSEMENT_CODE,
  isLumperReimbursable,
  lumperReimbursementChargeLines,
  sumLumperReimbursementCents,
  type StopLumperInput,
} from "./book-load-lumper";

describe("book-load-lumper — W6 broker-reimbursable math", () => {
  it("only broker-paid lumper is reimbursable", () => {
    expect(isLumperReimbursable("broker")).toBe(true);
    for (const paidBy of ["carrier", "shipper", "receiver", "unknown", null, undefined] as StopLumperInput["lumper_paid_by"][]) {
      expect(isLumperReimbursable(paidBy)).toBe(false);
    }
  });

  it("produces exactly one reimbursement line per broker-paid stop with an amount", () => {
    const stops: StopLumperInput[] = [
      { lumper_paid_by: "broker", lumper_amount_cents: 15000 },
      { lumper_paid_by: "carrier", lumper_amount_cents: 9000 }, // carrier-paid → not billed
      { lumper_paid_by: "broker", lumper_amount_cents: 0 }, // no amount → skipped
      { lumper_paid_by: "broker", lumper_amount_cents: 2500 },
    ];
    const lines = lumperReimbursementChargeLines(stops);
    expect(lines).toEqual([
      { code: LUMPER_REIMBURSEMENT_CODE, amount_cents: 15000 },
      { code: LUMPER_REIMBURSEMENT_CODE, amount_cents: 2500 },
    ]);
    expect(sumLumperReimbursementCents(stops)).toBe(17500);
  });

  it("carrier-paid lumper adds nothing to the invoice", () => {
    const stops: StopLumperInput[] = [{ lumper_paid_by: "carrier", lumper_amount_cents: 12000 }];
    expect(lumperReimbursementChargeLines(stops)).toEqual([]);
    expect(sumLumperReimbursementCents(stops)).toBe(0);
  });

  it("handles empty/undefined stops and negative/garbage amounts safely", () => {
    expect(sumLumperReimbursementCents(undefined)).toBe(0);
    expect(sumLumperReimbursementCents([])).toBe(0);
    expect(sumLumperReimbursementCents([{ lumper_paid_by: "broker", lumper_amount_cents: -500 }])).toBe(0);
  });
});
