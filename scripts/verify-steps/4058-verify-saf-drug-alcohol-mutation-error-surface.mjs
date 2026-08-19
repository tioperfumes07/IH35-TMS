export default {
  name: "verify-saf-drug-alcohol-mutation-error-surface",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-saf-drug-alcohol-mutation-error-surface.mjs"]);
  },
};
