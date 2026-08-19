export default {
  name: "verify-saf-safety-settings-query-error-surface",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-saf-safety-settings-query-error-surface.mjs"]);
  },
};
