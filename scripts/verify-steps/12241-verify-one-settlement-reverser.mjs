// ROUND 300 — one engine undoes a driver settlement. Import-safe (no DB).
import { run } from "../verify-one-settlement-reverser.mjs";

export default {
  name: "one-settlement-reverser",
  run: async () => {
    const failures = run();
    if (failures.length) {
      throw new Error("one-settlement-reverser FAIL:\n  " + failures.map((f) => "✗ " + f).join("\n  "));
    }
  },
};
