// ROUND 301 P0 #007–#011 — every UPDATE / DELETE in the listed money writers names its company. Import-safe (no DB).
import { run } from "../verify-money-writer-updates-name-company.mjs";

export default {
  name: "money-writer-updates-name-company",
  run: async () => {
    const failures = run();
    if (failures.length) {
      throw new Error("money-writer-updates-name-company FAIL:\n  " + failures.map((f) => "✗ " + f).join("\n  "));
    }
  },
};
