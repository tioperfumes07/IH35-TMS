// G3 (LINKAGE-LAW Clause 7) wired into verify:pre-commit. Fails when a verify-*.mjs guard is neither
// wired into the run chain nor listed in scripts/.guard-exempt.json. Import-safe.
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
