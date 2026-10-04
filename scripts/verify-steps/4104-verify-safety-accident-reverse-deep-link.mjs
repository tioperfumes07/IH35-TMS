export default {
  name: "verify-safety-accident-reverse-deep-link",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-safety-accident-reverse-deep-link.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-safety-accident-reverse-deep-link.mjs"]);
    // BANK-F91486 + BANK-F91514 — RouteDiagramSvg leftover muted refuse (dest #475569).
    await ctx.run("node", ["scripts/verify-fuel-planner-degraded-honesty.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-fuel-planner-degraded-honesty.mjs"]);
  },
};
