export default {
  name: "verify-vend-s01-roster-active-filter",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-vend-s01-roster-active-filter.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-vend-s01-roster-active-filter.mjs"]);
  },
};
