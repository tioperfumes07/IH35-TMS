export default {
  name: "verify-payrun-close-panel-settlement-load-links",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-payrun-close-panel-settlement-load-links.mjs"]);
  },
};
