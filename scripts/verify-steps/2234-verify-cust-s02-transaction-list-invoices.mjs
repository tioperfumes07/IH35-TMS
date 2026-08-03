export default {
  name: "verify-cust-s02-transaction-list-invoices",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-cust-s02-transaction-list-invoices.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-cust-s02-transaction-list-invoices.mjs"]);
  },
};
