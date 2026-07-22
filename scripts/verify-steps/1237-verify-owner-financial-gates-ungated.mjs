export default {
  name: "verify-owner-financial-gates-ungated",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-owner-financial-gates-ungated.mjs"]);
  },
};
