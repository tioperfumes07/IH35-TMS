export default {
  name: "verify-saf-meet-train-create-error-surface",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-saf-meet-train-create-error-surface.mjs"]);
  },
};
