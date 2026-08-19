export default {
  name: "verify-saf-safety-layout-query-error-surface",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-saf-safety-layout-query-error-surface.mjs"]);
  },
};
