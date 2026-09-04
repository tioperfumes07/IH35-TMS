export default {
  name: "verify-load-costs-cost-split-foots",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-load-costs-cost-split-foots.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-load-costs-cost-split-foots.mjs"]);
  },
};
