// LST-PICKER-01 payment_term consumers (claim 1842). SKIP≠PASS — throw on any defect.
import { collectProblems } from "../verify-lst-picker01-payment-term-inline-create.mjs";

export default {
  name: "lst-picker01-payment-term-inline-create",
  run: async (ctx) => {
    const problems = collectProblems();
    if (problems.length) {
      throw new Error(
        "lst-picker01-payment-term-inline-create FAIL:\n  " + problems.map((p) => "✗ " + p).join("\n  ")
      );
    }
    await ctx.run("node", ["scripts/verify-lst-picker01-payment-term-inline-create.mjs", "--selftest"]);
  },
};
