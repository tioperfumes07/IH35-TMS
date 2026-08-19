export default {
  name: "verify-load-settlement-summary-resolves-line-linked",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-load-settlement-summary-resolves-line-linked.mjs"]);
  },
};
