// LST-PICKER-01 CompanyViolationCreateModal company_violation_type (claim 1814).
import { collectProblems } from "../verify-lst-picker01-company-violation-type-inline-create.mjs";
export default {
  name: "lst-picker01-company-violation-type-inline-create",
  async run(ctx) {
    const problems = collectProblems();
    if (problems.length) {
      throw new Error(
        "lst-picker01-company-violation-type-inline-create FAIL:\n  " + problems.map((p) => "✗ " + p).join("\n  ")
      );
    }
    // BANK leftover slate refuse piggyback (F91199)
    await ctx.run("node", ["scripts/verify-custloc-coviol-login-slate-leftover-chrome.mjs", "--selftest"]);
    return ctx.run("node", ["scripts/verify-custloc-coviol-login-slate-leftover-chrome.mjs"]);
  },
};
