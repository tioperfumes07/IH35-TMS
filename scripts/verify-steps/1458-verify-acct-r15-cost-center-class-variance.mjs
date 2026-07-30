export default {
  name: "verify-acct-r15-cost-center-class-variance",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-acct-r15-cost-center-class-variance.mjs"]);
  },
};
