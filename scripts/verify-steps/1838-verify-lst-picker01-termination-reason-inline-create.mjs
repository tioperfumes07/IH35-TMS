// LST-PICKER-01 driver_termination_reason (claim 1838).
import { collectProblems } from "../verify-lst-picker01-termination-reason-inline-create.mjs";
export default {
  name: "lst-picker01-termination-reason-inline-create",
  run: async (ctx) => {
    await ctx.run("node", ["scripts/verify-lst-picker01-termination-reason-inline-create.mjs", "--selftest"]);
    const problems = collectProblems();
    if (problems.length) {
      throw new Error(
        "lst-picker01-termination-reason-inline-create FAIL:\n  " + problems.map((p) => "✗ " + p).join("\n  ")
      );
    }
  },
};
