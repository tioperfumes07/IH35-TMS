export default {
  name: "verify-inventory-assignments-no-dup-search",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-inventory-assignments-no-dup-search.mjs"]);
  },
};
