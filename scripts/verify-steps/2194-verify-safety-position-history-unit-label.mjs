export default {
  name: "verify-safety-position-history-unit-label",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-safety-position-history-unit-label.mjs"]);
  },
};
