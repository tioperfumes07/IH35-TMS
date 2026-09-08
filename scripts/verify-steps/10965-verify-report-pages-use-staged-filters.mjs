export default {
  name: "verify-report-pages-use-staged-filters",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-report-pages-use-staged-filters.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-report-pages-use-staged-filters.mjs"]);
  },
};
