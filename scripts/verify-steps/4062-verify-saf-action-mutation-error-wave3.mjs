export default {
  name: "verify-saf-action-mutation-error-wave3",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-saf-action-mutation-error-wave3.mjs"]);
  },
};
