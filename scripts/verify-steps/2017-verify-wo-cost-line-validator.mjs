export default {
  name: "verify-wo-cost-line-validator",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-wo-cost-line-validator.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-wo-cost-line-validator.mjs"]);
  },
};
