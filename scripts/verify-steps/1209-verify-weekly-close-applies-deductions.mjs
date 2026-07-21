// Landmine guard (2026-07-21): weekly-close.routes.ts must reuse the canonical deduction/reimbursement
// applier + aggregateSettlementTotals recompute (flag-gated, honest OFF-signal) instead of hardcoding
// deductions_total=0 / net_pay=grossPay. See scripts/verify-weekly-close-applies-deductions.mjs.
import { run } from "../verify-weekly-close-applies-deductions.mjs";

export default {
  name: "weekly-close-applies-deductions",
  run: async () => {
    const failures = run();
    if (failures.length) {
      throw new Error("weekly-close-applies-deductions FAIL:\n  " + failures.map((f) => "✗ " + f).join("\n  "));
    }
  },
};
