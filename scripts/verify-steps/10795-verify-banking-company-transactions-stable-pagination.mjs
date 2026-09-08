export default {
  name: "verify-banking-company-transactions-stable-pagination",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-banking-company-transactions-stable-pagination.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-banking-company-transactions-stable-pagination.mjs"]);
  },
};
