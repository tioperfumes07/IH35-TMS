export default {
  name: "verify-intransit-issues-staged-filters",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-intransit-issues-staged-filters.mjs"]);
  },
};
