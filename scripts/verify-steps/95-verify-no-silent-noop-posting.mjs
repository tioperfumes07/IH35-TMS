// Tier-1 0007 wired into verify:pre-commit. Fails when a flag-gated posting leg is a silent no-op
// (positive if(flag){post} gate with no honest OFF-signal). Import-safe.
import { run } from "../verify-no-silent-noop-posting.mjs";

export default {
  name: "no-silent-noop-posting",
  run: async () => {
    const failures = run();
    if (failures.length) {
      throw new Error("no-silent-noop-posting FAIL:\n  " + failures.map((f) => "✗ " + f).join("\n  "));
    }
  },
};
