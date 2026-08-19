export default {
  name: "verify-saf-complaints-query-error-surface",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-saf-complaints-query-error-surface.mjs"]);
  },
};
