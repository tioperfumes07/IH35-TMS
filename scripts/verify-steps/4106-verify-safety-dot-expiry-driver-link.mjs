export default {
  name: "verify-safety-dot-expiry-driver-link",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-safety-dot-expiry-driver-link.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-safety-dot-expiry-driver-link.mjs"]);
    // BANK-F91487 — plannerTimeAxis leftover muted refuse (10481 is ODD; leftover now on this EVEN host).
    await ctx.run("node", ["scripts/verify-k5-planner-calendar-mmm-dd.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-k5-planner-calendar-mmm-dd.mjs"]);
  },
};
