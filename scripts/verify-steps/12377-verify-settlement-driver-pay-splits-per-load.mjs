// ROUND 372.5: settlement driver pay splits one line per load from the settlement's own pay lines, tying to gross to
// the cent. Import-safe static half; the live half (runs tie, bills carry loads, legacy lines shrink-only, new bill
// postings stamped) runs in the money gate.
import { run } from "../verify-settlement-driver-pay-splits-per-load.mjs";

export default {
  name: "settlement-driver-pay-splits-per-load",
  run: async () => {
    const failures = run();
    if (failures.length) throw new Error("settlement-driver-pay-splits-per-load FAIL:\n  " + failures.join("\n  "));
  },
};
