// G1 (LINKAGE-LAW Clause 7) wired into verify:pre-commit. Fails when an issued/changed block is
// unregistered or a new/changed .block-ready entry is missing the contract. Import-safe; see the guard.
import { run } from "../verify-block-registry-complete.mjs";

export default {
  name: "block-registry-complete",
  run: async () => {
    const failures = run();
    if (failures.length) {
      throw new Error("block-registry-complete FAIL:\n  " + failures.map((f) => "✗ " + f).join("\n  "));
    }
  },
};
