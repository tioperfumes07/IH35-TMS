export default {
  name: "verify:referenceselect-filter-mode",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-referenceselect-filter-mode.mjs"]);
  },
};
