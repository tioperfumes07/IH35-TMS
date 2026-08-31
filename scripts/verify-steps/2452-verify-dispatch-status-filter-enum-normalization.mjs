export default {
  name: "verify-dispatch-status-filter-enum-normalization",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-dispatch-status-filter-enum-normalization.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-dispatch-status-filter-enum-normalization.mjs"]);
  },
};
