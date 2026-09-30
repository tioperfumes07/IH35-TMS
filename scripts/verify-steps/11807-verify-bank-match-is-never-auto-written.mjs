export default {
  name: "verify-bank-match-is-never-auto-written",
  async run(ctx) {
    // ORPHAN-GUARD SWEEP (Lead, 2026-09-30): passes today, ran nowhere. An unwired guard
    // is a fake green. Measured before wiring: PASS.
    await ctx.run("node", ["scripts/verify-bank-match-is-never-auto-written.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-bank-match-is-never-auto-written.mjs"]);
  },
};
