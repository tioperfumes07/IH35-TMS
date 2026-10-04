export default {
  name: "verify-pm-auto-engine-mutation-errors-surfaced",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-pm-auto-engine-mutation-errors-surfaced.mjs"]);
    // BANK-F91465 — PM due source + unit faults reverse (never ran in CI).
    await ctx.run("node", ["scripts/ops/verify-maint-pm-due-source-faults.mjs", "--selftest"]);
  },
};
