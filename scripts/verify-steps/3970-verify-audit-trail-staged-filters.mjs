export default {
  name: "verify-audit-trail-staged-filters",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-audit-trail-staged-filters.mjs"]);
  },
};
