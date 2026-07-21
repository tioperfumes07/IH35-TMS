// REPAIR-A follow-on guard wired into verify:pre-commit. Fails if weekly-close.routes.ts regresses to
// the broken [X, 0, 0, X] literal shape (deductions_total/reimbursements_total hardcoded to 0, net_pay
// hardcoded to the gross var) or otherwise composes those three fields without going through the
// canonical aggregateSettlementTotals(...) / applyPendingDeductionsToSettlementWithNetFloor(...) path.
// Import-safe.
import { run } from "../verify-weekly-close-no-hardcoded-gross-net.mjs";

export default {
  name: "weekly-close-no-hardcoded-gross-net",
  run: async () => {
    const failures = run();
    if (failures.length) {
      throw new Error(
        "weekly-close-no-hardcoded-gross-net FAIL:\n  " + failures.map((f) => "✗ " + f).join("\n  ")
      );
    }
  },
};
