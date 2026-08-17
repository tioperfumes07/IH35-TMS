export default {
  name: "verify-finance-preview-readiness",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-finance-preview-readiness.mjs"]);
  },
};
