export default {
  name: "verify-work-orders-console-no-dup-search",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-work-orders-console-no-dup-search.mjs"]);
  },
};
