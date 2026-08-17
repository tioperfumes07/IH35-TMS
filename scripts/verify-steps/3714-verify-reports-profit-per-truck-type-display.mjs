export default {
  name: "verify-reports-profit-per-truck-type-display",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-reports-profit-per-truck-type-display.mjs"]);
  },
};
