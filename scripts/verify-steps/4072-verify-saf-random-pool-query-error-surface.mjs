export default {
  name: "verify-saf-random-pool-query-error-surface",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-saf-random-pool-query-error-surface.mjs"]);
  },
};
