// G3 + B-D2: every verify-*.mjs must be FULLY WIRED (package.json script AND CI execution
// via workflow or verify-steps/pre-commit) or listed in scripts/.guard-exempt.json.
// package.json-only = fail (B-A1 regression class). Import-safe.
import { run } from "../verify-guard-wired.mjs";

export default {
  name: "guard-wired",
  run: async () => {
    const failures = run();
    if (failures.length) {
      throw new Error("guard-wired FAIL:\n  " + failures.map((f) => "✗ " + f).join("\n  "));
    }
  },
};
