// R90-35 (ROUND 9.0 BOARD 35 — 2026-11-13) — CI wire for Settlement Statement parity guard.
// Claimed CC-1 step 20169 (mod 4 == 1).
export default {
  name: "verify-settlements-statement-board35-parity",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-settlements-statement-board35-parity.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-settlements-statement-board35-parity.mjs"]);
  },
};
