// SET-04 wired into verify:pre-commit. Fails if the canonical Bill+BillPayment settlement poster
// (postSettlementBillPayment) has no mounted forward HTTP route. Import-safe (no DB).
import { run } from "../verify-canonical-settlement-poster-mounted.mjs";

export default {
  name: "canonical-settlement-poster-mounted",
  run: async () => {
    const failures = run();
    if (failures.length) {
      throw new Error(
        "canonical-settlement-poster-mounted FAIL:\n  " + failures.map((f) => "✗ " + f).join("\n  ")
      );
    }
  },
};
