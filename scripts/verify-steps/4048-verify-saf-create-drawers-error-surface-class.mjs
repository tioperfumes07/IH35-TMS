export default {
  name: "verify-saf-create-drawers-error-surface-class",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-saf-create-drawers-error-surface-class.mjs"]);
  },
};
