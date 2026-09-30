export default {
  name: "verify-check-stock-allocator",
  async run(ctx) {
    // ORPHAN-GUARD SWEEP (Lead, 2026-09-30): this guard PASSES today and ran NOWHERE —
    // neither package.json nor CI. An unwired guard is a fake green. Wiring a passing guard
    // costs nothing and turns a dead file into live protection. Measured before wiring: PASS.
    await ctx.run("node", ["scripts/verify-check-stock-allocator.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-check-stock-allocator.mjs"]);
  },
};
