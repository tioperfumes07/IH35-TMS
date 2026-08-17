export default {
  name: "verify-customers-detail-status-label",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-customers-detail-status-label.mjs"]);
  },
};
