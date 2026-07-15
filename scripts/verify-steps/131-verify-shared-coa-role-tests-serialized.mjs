// TEST-HYGIENE guard wired into verify:pre-commit. Fails when a backend db.test seeds a shared singleton
// COA role (ar_control/ap_control/cash_clearing) on the shared TRANSP company without serializing on the
// shared advisory lock — the chain-06 "no mapped ar_control role" flake class. Import-safe (no DB).
import { run } from "../verify-shared-coa-role-tests-serialized.mjs";

export default {
  name: "shared-coa-role-tests-serialized",
  run: async () => {
    const failures = run();
    if (failures.length) {
      throw new Error("shared-coa-role-tests-serialized FAIL:\n  " + failures.map((f) => "✗ " + f).join("\n  "));
    }
  },
};
