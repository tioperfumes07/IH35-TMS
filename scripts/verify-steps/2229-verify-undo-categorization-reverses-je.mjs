export default {
  name: "verify-undo-categorization-reverses-je",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-undo-categorization-reverses-je.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-undo-categorization-reverses-je.mjs"]);
  },
};
