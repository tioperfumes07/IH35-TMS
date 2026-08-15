export default {
  name: "verify-severe-repair-oos-no-dup-search",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-severe-repair-oos-no-dup-search.mjs"]);
  },
};
