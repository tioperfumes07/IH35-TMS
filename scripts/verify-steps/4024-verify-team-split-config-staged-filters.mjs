export default {
  name: "verify-team-split-config-staged-filters",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-team-split-config-staged-filters.mjs"]);
  },
};
