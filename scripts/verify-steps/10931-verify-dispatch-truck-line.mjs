export default {
  name: "verify:dispatch-truck-line",
  run(ctx) {
    ctx.run("node", ["scripts/verify-dispatch-truck-line.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-dispatch-truck-line.mjs"]);
    // ROUND 155.6 — unit_id top-level uniqueness + CURRENT helper + sections + empty state
    ctx.run("node", ["scripts/verify-truck-line-unit-top-level-unique.mjs"]);
    // ROUND 280.17 / 255 — board === canonical active-load set (REQUIRES_LIVE_DB; fails closed without DATABASE_URL)
    ctx.run("node", ["scripts/verify-truck-line-board-shows-canonical-active-set.mjs"]);
    // ROUND 167 — rail + stamping remain wired on TruckLineBoard
    ctx.run("node", ["scripts/verify-truck-line-rail-and-stamping-are-wired.mjs"]);
  },
};
