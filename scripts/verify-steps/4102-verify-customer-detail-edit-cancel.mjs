export default {
  name: "verify-customer-detail-edit-cancel",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-customer-detail-edit-cancel.mjs"]);
  },
};
