export default {
  name: "verify-ap-aging-no-dup-search",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-ap-aging-no-dup-search.mjs"]);
  },
};
