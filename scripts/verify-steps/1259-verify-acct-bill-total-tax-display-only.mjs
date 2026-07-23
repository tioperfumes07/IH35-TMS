export default {
  name: "verify-acct-bill-total-tax-display-only",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-acct-bill-total-tax-display-only.mjs"]);
  },
};
