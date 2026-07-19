export default {
  name: "verify-revenue-gl-linkage-db-isolation",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-revenue-gl-linkage-db-isolation.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-revenue-gl-linkage-db-isolation.mjs"]);
  },
};
