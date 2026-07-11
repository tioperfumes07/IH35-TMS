// G2 (LINKAGE-LAW Clause 6/8) wired into verify:pre-commit. Fails when a done/complete block has an
// unresolved acceptance[] item. Import-safe; forward-only; DB kinds deferred to the Neon proof.
import { run } from "../verify-block-acceptance.mjs";

export default {
  name: "block-acceptance",
  run: async () => {
    const failures = run();
    if (failures.length) {
      throw new Error("block-acceptance FAIL:\n  " + failures.map((f) => "✗ " + f).join("\n  "));
    }
  },
};
