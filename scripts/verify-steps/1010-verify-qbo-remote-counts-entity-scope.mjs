// D-#1 RECON-COLLECTOR. Fails when any SQL touching accounting.qbo_remote_counts omits an
// operating_company_id predicate (cross-entity read under withLuciaBypass). Import-safe; throws.
import { run } from "../verify-qbo-remote-counts-entity-scope.mjs";

export default {
  name: "qbo-remote-counts-entity-scope",
  run: async () => {
    const failures = run();
    if (failures.length) {
      throw new Error("qbo-remote-counts-entity-scope FAIL:\n  " + failures.map((f) => "✗ " + f).join("\n  "));
    }
  },
};
