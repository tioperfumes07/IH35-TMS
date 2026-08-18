export default {
  name: "verify-money-detail-page-uses-ispending",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-money-detail-page-uses-ispending.mjs"]);
  },
};
