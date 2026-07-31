// LST-PICKER-01 CostBreakdownBox part createKind parity (claim 1878).
export default {
  name: "verify-lst-picker01-cost-breakdown-part-createkind",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-lst-picker01-cost-breakdown-part-createkind.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-lst-picker01-cost-breakdown-part-createkind.mjs"]);
  },
};
