// ROUND 288.3 item 3 — driver page Add payment = one pay line through the pay-line engine. Import-safe (no DB).
import { run } from "../verify-driver-add-payment-line.mjs";

export default {
  name: "driver-add-payment-line",
  run: async () => {
    const failures = run();
    if (failures.length) {
      throw new Error("driver-add-payment-line FAIL:\n  " + failures.map((f) => "✗ " + f).join("\n  "));
    }
  },
};
