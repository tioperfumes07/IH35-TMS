export default {
  name: "verify-saf-action-mutation-error-wave4",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-saf-action-mutation-error-wave4.mjs"]);
  },
};
