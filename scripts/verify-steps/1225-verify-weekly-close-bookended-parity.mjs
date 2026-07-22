// Law §9 parity: weekly-close must reuse bookended contract-terms + auto-deduct + net-floor order.
import { run } from "../verify-weekly-close-bookended-parity.mjs";

export default {
  name: "weekly-close-bookended-parity",
  run: async () => {
    const failures = run();
    if (failures.length) {
      throw new Error("weekly-close-bookended-parity FAIL:\n  " + failures.map((f) => "✗ " + f).join("\n  "));
    }
  },
};
