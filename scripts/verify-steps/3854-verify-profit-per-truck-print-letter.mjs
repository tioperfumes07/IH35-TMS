export default {
  name: "verify-profit-per-truck-print-letter",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-profit-per-truck-print-letter.mjs"]);
  },
};
