import { describe, expect, it } from "vitest";

import {
  CAPITALIZE_REPAIR_THRESHOLD_CENTS,
  HEAVY_REPAIR_EXPENSE_COA_ROLE,
  decideRepairBooksTreatment,
  repairBooksExpenseCoaRole,
} from "../capitalize-threshold.js";

// GO-20 slice 17 (docs/lockdown/GO-20-EIGHT-FEATURES.txt / GO-19-BUILD-QUEUE.txt) — explicit
// boundary-value coverage for the owner-locked $7,000 (700_000c) capitalize-vs-expense rule
// (A4-D6, docs/lockdown/GO-19-OWNER-DECISIONS-CLOSED-2026-09-01.md §4, CLOSED at $7,000, NEVER
// $7,500): "$6,999 -> expense account · $7,001 -> capitalize account." This is the app-side
// decision function poster.service.ts calls (see apps/backend/src/accounting/maintenance-posting/
// poster.service.ts's insertBillLinesFromWorkOrder) -- the live wiring itself is asserted
// separately by scripts/verify-capitalize-threshold-7000.mjs's static wiringErrors() check; this
// test proves the DECISION LOGIC itself is correct at the exact two dollar amounts the owner named.
describe("capitalize-threshold — GO-20 slice 17 boundary values", () => {
  it("locks the threshold at exactly $7,000.00 (700_000 cents)", () => {
    expect(CAPITALIZE_REPAIR_THRESHOLD_CENTS).toBe(700_000);
  });

  it("$6,999.00 -> expense (Heavy Repair Expense role)", () => {
    const treatment = decideRepairBooksTreatment(699_900);
    expect(treatment).toBe("expense");
    expect(repairBooksExpenseCoaRole(treatment)).toBe(HEAVY_REPAIR_EXPENSE_COA_ROLE);
  });

  it("$7,001.00 -> capitalize (fixed-asset register, no expense role)", () => {
    const treatment = decideRepairBooksTreatment(700_100);
    expect(treatment).toBe("capitalize");
    expect(repairBooksExpenseCoaRole(treatment)).toBeNull();
  });

  it("exactly $7,000.00 -> capitalize (>=, not >)", () => {
    expect(decideRepairBooksTreatment(700_000)).toBe("capitalize");
  });

  it("one cent under $7,000.00 -> expense", () => {
    expect(decideRepairBooksTreatment(699_999)).toBe("expense");
  });

  it("rejects a negative or non-finite amount rather than silently picking a treatment", () => {
    expect(() => decideRepairBooksTreatment(-1)).toThrow();
    expect(() => decideRepairBooksTreatment(Number.NaN)).toThrow();
  });
});
