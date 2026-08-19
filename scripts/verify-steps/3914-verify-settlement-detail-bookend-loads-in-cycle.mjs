export default {
  name: "verify-settlement-detail-bookend-loads-in-cycle",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-settlement-detail-bookend-loads-in-cycle.mjs"]);
  },
};
