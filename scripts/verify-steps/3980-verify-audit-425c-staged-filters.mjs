export default {
  name: "verify-audit-425c-staged-filters",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-audit-425c-staged-filters.mjs"]);
  },
};
