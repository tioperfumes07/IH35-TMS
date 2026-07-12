// p1-circular-dependencies — wired into verify:pre-commit. Fails when a backend import cycle appears
// outside the explicit allowlist (regression-protects the two broken type-only cycles and blocks new
// ones). Import-safe.
import { run } from "../verify-no-circular-dependencies.mjs";

export default {
  name: "no-circular-dependencies",
  run: async () => {
    const failures = run();
    if (failures.length) {
      throw new Error("no-circular-dependencies FAIL:\n  " + failures.map((f) => "✗ " + f).join("\n  "));
    }
  },
};
