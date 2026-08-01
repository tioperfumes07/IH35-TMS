export default {
  name: "verify-db-test-units-are-sample-data",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-db-test-units-are-sample-data.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-db-test-units-are-sample-data.mjs"]);
  },
};
