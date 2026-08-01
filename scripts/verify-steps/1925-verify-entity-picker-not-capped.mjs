export default {
  name: "verify-entity-picker-not-capped",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-entity-picker-not-capped.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-entity-picker-not-capped.mjs"]);
  },
};
