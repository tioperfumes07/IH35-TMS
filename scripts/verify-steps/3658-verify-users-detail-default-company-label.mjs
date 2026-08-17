export default {
  name: "verify-users-detail-default-company-label",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-users-detail-default-company-label.mjs"]);
  },
};
