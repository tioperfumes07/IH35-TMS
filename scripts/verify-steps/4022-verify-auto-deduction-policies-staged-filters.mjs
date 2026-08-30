export default {
  name: "verify-auto-deduction-policies-staged-filters",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-auto-deduction-policies-staged-filters.mjs"]);
    await ctx.run("node", ["scripts/verify-auto-deduction-policies-staged-filters.mjs", "--selftest"]);
  },
};
