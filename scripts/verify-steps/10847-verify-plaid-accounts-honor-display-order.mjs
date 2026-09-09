export default {
  name: "verify-plaid-accounts-honor-display-order",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-plaid-accounts-honor-display-order.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-plaid-accounts-honor-display-order.mjs"]);
  },
};
