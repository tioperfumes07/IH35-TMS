export default {
  name: "verify-auto-invoice-on-bol-wired",
  async run(ctx) {
    // ORPHAN-GUARD SWEEP (Lead, 2026-09-30): passes today, ran nowhere. An unwired guard
    // is a fake green. Measured before wiring: PASS.
    await ctx.run("node", ["scripts/verify-auto-invoice-on-bol-wired.mjs"]);
  },
};
