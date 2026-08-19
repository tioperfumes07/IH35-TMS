export default {
  name: "verify-saf-driver-files-tab-query-error-surface",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-saf-driver-files-tab-query-error-surface.mjs"]);
  },
};
