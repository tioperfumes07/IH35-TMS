export default {
  name: "verify-customers-transaction-filter-staged-apply",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-customers-transaction-filter-staged-apply.mjs"]);
  },
};
