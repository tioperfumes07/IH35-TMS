export default {
  name: "verify-cust-link-01-invoice-lines-honest",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-cust-link-01-invoice-lines-honest.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-cust-link-01-invoice-lines-honest.mjs"]);
  },
};
