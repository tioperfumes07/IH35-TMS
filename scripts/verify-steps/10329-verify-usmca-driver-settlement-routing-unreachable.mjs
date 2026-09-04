export default {
  name: "verify-usmca-driver-settlement-routing-unreachable",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-usmca-driver-settlement-routing-unreachable.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-usmca-driver-settlement-routing-unreachable.mjs"]);
  },
};
