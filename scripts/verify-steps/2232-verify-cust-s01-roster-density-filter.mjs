export default {
  name: "verify-cust-s01-roster-density-filter",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-cust-s01-roster-density-filter.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-cust-s01-roster-density-filter.mjs"]);
  },
};
