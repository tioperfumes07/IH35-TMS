export default {
  name: "verify-cust-chrome-header-action-parity",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-cust-chrome-header-action-parity.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-cust-chrome-header-action-parity.mjs"]);
  },
};
