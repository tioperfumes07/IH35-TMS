export default {
  name: "verify-fleet-hos-board-staged-filters",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-fleet-hos-board-staged-filters.mjs"]);
    await ctx.run("node", ["scripts/verify-fleet-hos-board-staged-filters.mjs", "--selftest"]);
  },
};
