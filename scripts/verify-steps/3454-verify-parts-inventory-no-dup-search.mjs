export default {
  name: "verify-parts-inventory-no-dup-search",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-parts-inventory-no-dup-search.mjs"]);
  },
};
