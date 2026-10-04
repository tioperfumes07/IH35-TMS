export default {
  name: "verify-maint-wo-create-primary-opens",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-maint-wo-create-primary-opens.mjs"]);
    // BANK-F91458 — WO three dates as columns (never ran in CI).
    await ctx.run("node", ["scripts/ops/verify-maint-wo-three-dates.mjs", "--selftest"]);
  },
};
