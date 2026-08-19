export default {
  name: "verify-fault-drafts-staged-filters",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-fault-drafts-staged-filters.mjs"]);
  },
};
