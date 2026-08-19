export default {
  name: "verify-saf-rtd-query-error-surface",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-saf-rtd-query-error-surface.mjs"]);
  },
};
