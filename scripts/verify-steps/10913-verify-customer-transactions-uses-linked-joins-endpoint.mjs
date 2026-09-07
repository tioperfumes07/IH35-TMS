export default {
  name: "verify-customer-transactions-uses-linked-joins-endpoint",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-customer-transactions-uses-linked-joins-endpoint.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-customer-transactions-uses-linked-joins-endpoint.mjs"]);
  },
};
