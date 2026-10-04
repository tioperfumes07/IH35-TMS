export default {
  name: "verify-work-orders-console-no-dup-search",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-work-orders-console-no-dup-search.mjs"]);
    // BANK-F91469 — R313 Maintenance designs primary subnav (never ran in CI).
    await ctx.run("node", ["scripts/ops/verify-r313-maintenance-designs.mjs", "--selftest"]);
  },
};
