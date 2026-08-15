export default {
  name: "verify-road-service-no-dup-search",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-road-service-no-dup-search.mjs"]);
  },
};
