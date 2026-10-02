// ROUND 297 driver-profile audit — settlement YTD / lifetime / weeks exclude open drafts. Import-safe (no DB).
import { run } from "../verify-driver-settlement-totals-exclude-drafts.mjs";

export default {
  name: "driver-settlement-totals-exclude-drafts",
  run: async () => {
    const failures = run();
    if (failures.length) {
      throw new Error("driver-settlement-totals-exclude-drafts FAIL:\n  " + failures.map((f) => "✗ " + f).join("\n  "));
    }
  },
};
