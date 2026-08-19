export default {
  name: "verify-dot-inspections-staged-filters",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-dot-inspections-staged-filters.mjs"]);
  },
};
