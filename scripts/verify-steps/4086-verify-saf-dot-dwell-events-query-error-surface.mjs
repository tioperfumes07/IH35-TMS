export default {
  name: "verify-saf-dot-dwell-events-query-error-surface",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-saf-dot-dwell-events-query-error-surface.mjs"]);
  },
};
