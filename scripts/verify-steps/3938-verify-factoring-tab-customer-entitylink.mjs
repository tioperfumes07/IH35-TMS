export default {
  name: "verify-factoring-tab-customer-entitylink",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-factoring-tab-customer-entitylink.mjs"]);
  },
};
