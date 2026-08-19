export default {
  name: "verify-saf-integrity-csa-mutation-error-surface",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-saf-integrity-csa-mutation-error-surface.mjs"]);
  },
};
