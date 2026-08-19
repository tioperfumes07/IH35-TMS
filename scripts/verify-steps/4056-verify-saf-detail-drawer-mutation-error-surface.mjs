export default {
  name: "verify-saf-detail-drawer-mutation-error-surface",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-saf-detail-drawer-mutation-error-surface.mjs"]);
  },
};
