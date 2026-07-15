// P2.4a wired into verify:pre-commit. Fails if settlements/approval.service.ts regresses off the
// canonical driver_finance.* settlement store back onto the RETIRE settlement.* tables. Import-safe.
import { run } from "../verify-settlement-approval-canonical.mjs";

export default {
  name: "settlement-approval-canonical",
  run: async () => {
    const failures = run();
    if (failures.length) {
      throw new Error("settlement-approval-canonical FAIL:\n  " + failures.map((f) => "✗ " + f).join("\n  "));
    }
  },
};
