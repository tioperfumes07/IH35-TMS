// ROUND 326 queue item 6 — driver escrow 2100 series: $25 default line in the Settlement Creator, X to remove,
// own subtotal; escrow resolves the driver's own 2100-00-0NN liability. Import-safe (no DB).
import { run } from "../verify-driver-escrow-2100-default-line.mjs";

export default {
  name: "driver-escrow-2100-default-line",
  run: async () => {
    const failures = run();
    if (failures.length) {
      throw new Error("driver-escrow-2100-default-line FAIL:\n  " + failures.map((f) => "✗ " + f).join("\n  "));
    }
  },
};
