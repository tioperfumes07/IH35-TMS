// ROUND 296 6 — factoring chargebacks are the company's, never a driver's. Import-safe (no DB).
import { run } from "../verify-no-factoring-chargeback-to-driver.mjs";

export default {
  name: "no-factoring-chargeback-to-driver",
  run: async () => {
    const failures = run();
    if (failures.length) {
      throw new Error("no-factoring-chargeback-to-driver FAIL:\n  " + failures.map((f) => "✗ " + f).join("\n  "));
    }
  },
};
