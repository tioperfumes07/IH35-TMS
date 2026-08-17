export default {
  name: "verify-break-even-staged-filters",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-break-even-staged-filters.mjs"]);
  },
};
