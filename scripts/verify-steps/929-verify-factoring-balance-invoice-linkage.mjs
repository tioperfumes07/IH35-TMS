export default {
  name: "verify-factoring-balance-invoice-linkage",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-factoring-balance-invoice-linkage.mjs"]);
    await ctx.run("node", ["scripts/verify-factoring-balance-invoice-linkage.mjs", "--selftest"]);
  },
};
