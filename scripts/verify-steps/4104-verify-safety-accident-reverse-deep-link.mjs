export default {
  name: "verify-safety-accident-reverse-deep-link",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-safety-accident-reverse-deep-link.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-safety-accident-reverse-deep-link.mjs"]);
    // BANK-F91486 — RouteDiagramSvg leftover muted refuse (orphan fuel-planner guard, never in CI).
    await ctx.run("node", ["scripts/verify-fuel-planner-degraded-honesty.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-fuel-planner-degraded-honesty.mjs"]);
  },
};
