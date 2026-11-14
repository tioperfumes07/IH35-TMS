// R90-36/37/38/39/40/41/42 (ROUND 9.0 BOARDS 36-42 — 2026-11-13) — CI wire for Settlements boards 36-42 parity guard.
// Claimed CC-1 step 20173 (mod 4 == 1).
export default {
  name: "verify-settlements-boards36-42-parity",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-settlements-boards36-42-parity.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-settlements-boards36-42-parity.mjs"]);
  },
};
