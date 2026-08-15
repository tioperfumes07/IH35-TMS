export default {
  name: "verify-nonmoney-exact-entity-nouns",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-nonmoney-exact-entity-nouns.mjs"]);
  },
};
