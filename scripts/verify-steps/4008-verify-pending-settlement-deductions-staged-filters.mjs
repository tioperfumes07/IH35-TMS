export default {
  name: "verify-pending-settlement-deductions-staged-filters",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-pending-settlement-deductions-staged-filters.mjs"]);
  },
};
