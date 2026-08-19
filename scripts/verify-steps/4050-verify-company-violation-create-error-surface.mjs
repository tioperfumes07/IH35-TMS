export default {
  name: "verify-company-violation-create-error-surface",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-company-violation-create-error-surface.mjs"]);
  },
};
