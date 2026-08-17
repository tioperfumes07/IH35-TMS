export default {
  name: "verify-je-source-links-invoice-bill-display-id",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-je-source-links-invoice-bill-display-id.mjs"]);
  },
};
