// LST-PICKER-01 Book Load detention_reason (claim 1848).
import { collectProblems } from "../verify-lst-picker01-detention-reason-inline-create.mjs";
export default {
  name: "lst-picker01-detention-reason-inline-create",
  run: async () => {
    const problems = collectProblems();
    if (problems.length) {
      throw new Error(
        "lst-picker01-detention-reason-inline-create FAIL:\n  " + problems.map((p) => "✗ " + p).join("\n  ")
      );
    }
  },
};
