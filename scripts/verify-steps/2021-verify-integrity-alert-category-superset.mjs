export default {
  name: "verify-integrity-alert-category-superset",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-integrity-alert-category-superset.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-integrity-alert-category-superset.mjs"]);
  },
};
