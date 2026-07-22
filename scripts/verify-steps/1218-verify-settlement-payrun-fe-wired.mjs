/**
 * LAW-E2E #3168 — Settlements UI must call payrun-preview + payrun-close (no dead button).
 * Rule 17: verify-step only — do NOT edit package.json / locked-guards / ci.yml.
 */
import { run } from "../verify-settlement-payrun-fe-wired.mjs";

export default {
  name: "settlement-payrun-fe-wired",
  run: async () => {
    const f = run();
    if (f.length) {
      throw new Error("settlement-payrun-fe-wired FAIL:\n  " + f.map((x) => "✗ " + x).join("\n  "));
    }
  },
};
