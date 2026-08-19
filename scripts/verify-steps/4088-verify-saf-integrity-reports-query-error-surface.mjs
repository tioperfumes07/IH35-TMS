export default {
  name: "verify-saf-integrity-reports-query-error-surface",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-saf-integrity-reports-query-error-surface.mjs"]);
  },
};
