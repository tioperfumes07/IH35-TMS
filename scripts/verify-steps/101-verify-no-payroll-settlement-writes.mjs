// G4 (settlement engine collapse) wired into verify:pre-commit. Fails if LIVE (non-.deprecated,
// non-test) code writes the RETIRE payroll.driver_settlements / driver_settlement_line_items ledger.
// Shrink-only ratchet over scripts/verify-no-payroll-settlement-writes.baseline.json. Import-safe.
import { run } from "../verify-no-payroll-settlement-writes.mjs";

export default {
  name: "no-payroll-settlement-writes",
  run: async () => {
    const failures = run();
    if (failures.length) {
      throw new Error("no-payroll-settlement-writes FAIL:\n  " + failures.map((f) => "✗ " + f).join("\n  "));
    }
  },
};
