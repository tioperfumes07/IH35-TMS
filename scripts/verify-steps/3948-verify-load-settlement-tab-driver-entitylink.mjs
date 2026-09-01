export default {
  name: "verify-load-settlement-tab-driver-entitylink",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-load-settlement-tab-driver-entitylink.mjs"]);
    await ctx.run("node", ["scripts/verify-settlement-tab-gross-net-dollar-format.mjs"]);
  },
};
