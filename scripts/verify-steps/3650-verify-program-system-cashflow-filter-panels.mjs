/** @type {import("./_context.mjs").VerifyStep} */
export default {
  name: "verify-program-system-cashflow-filter-panels",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-program-system-cashflow-filter-panels.mjs"]);
  },
};
