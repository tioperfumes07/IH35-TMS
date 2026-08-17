export default {
  name: "verify-reports-customer-tombstone-link-consumers",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-reports-customer-tombstone-link-consumers.mjs"]);
  },
};
