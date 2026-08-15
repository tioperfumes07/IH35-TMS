export default {
  name: "verify-customer-picker-canonical-labels",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-customer-picker-canonical-labels.mjs"]);
  },
};
