// 0243-h7-2 — QBO minorversion consistency. Fails if any backend QBO URL pins a minorversion below
// the canonical minimum (75). Regression guard for the deep-health companyinfo probe (was 65).
import { run } from "../verify-qbo-minorversion-consistent.mjs";

export default {
  name: "qbo-minorversion-consistent",
  run: async () => {
    const offenders = run();
    if (offenders.length) {
      throw new Error("qbo-minorversion-consistent FAIL:\n  " + offenders.map((o) => "✗ " + o).join("\n  "));
    }
  },
};
