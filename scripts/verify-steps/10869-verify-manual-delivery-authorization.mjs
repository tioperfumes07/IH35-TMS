export default {
  name: "verify-manual-delivery-authorization",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-manual-delivery-authorization.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-manual-delivery-authorization.mjs"]);
    // ROUND 292 — named FE queue for FACTOR-BUT-NOT-DELIVERED must stay wired with the engine.
    await ctx.run("node", ["scripts/verify-needs-delivery-authorization-wired.mjs"]);
  },
};
