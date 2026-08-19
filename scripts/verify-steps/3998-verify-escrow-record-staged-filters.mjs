export default {
  name: "verify-escrow-record-staged-filters",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-escrow-record-staged-filters.mjs"]);
  },
};
