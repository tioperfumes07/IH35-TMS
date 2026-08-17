export default {
  name: "verify-adjacent-entity-filter-silent-apply",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-adjacent-entity-filter-silent-apply.mjs"]);
  },
};
