export default {
  name: "verify-saf-dot-followup-mutation-error-surface",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-saf-dot-followup-mutation-error-surface.mjs"]);
  },
};
