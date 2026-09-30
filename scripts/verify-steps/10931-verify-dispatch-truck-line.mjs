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
    // ROUND 280 unblocker — Cursor-lane dispatch/settlement orphans → verify-steps (clears guard-wired)
    ctx.run("node", ["scripts/verify-dispatch-query-keys-and-boundaries.mjs"]);
    ctx.run("node", ["scripts/verify-no-multi-value-cell.mjs"]);
    ctx.run("node", ["scripts/verify-no-fabricated-load-numbers.mjs"]);
    ctx.run("node", ["scripts/verify-no-duplicate-non-owned-trailer.mjs"]);
    ctx.run("node", ["scripts/verify-open-driver-bill-keeps-load-active.mjs"]);
    ctx.run("node", ["scripts/verify-presettlement-shows-only-this-load-and-its-open-tour.mjs"]);
    ctx.run("node", ["scripts/verify-r186-1-presettlement-p-series.mjs"]);
    ctx.run("node", ["scripts/verify-presettlement-renders-pending.mjs"]);
    ctx.run("node", ["scripts/verify-settlement-creator-fuel-gate.mjs"]);
    ctx.run("node", ["scripts/verify-settlement-display-id-override-is-409.mjs"]);
    ctx.run("node", ["scripts/verify-settlement-number-source-is-typed.mjs"]);
    ctx.run("node", ["scripts/verify-tour-groups-by-tour-id-only.mjs"]);
    ctx.run("node", ["scripts/verify-load-status-has-audit-event.mjs"]);
    ctx.run("node", ["scripts/verify-stop-lane-is-consistent-with-miles.mjs"]);
    ctx.run("node", ["scripts/verify-driver-bill-has-miles-and-rate.mjs"]);
    ctx.run("node", ["scripts/verify-settlement-line-carries-miles-and-rate.mjs"]);
    ctx.run("node", ["scripts/verify-settlement-line-off-is-voided.mjs"]);
    ctx.run("node", ["scripts/verify-stops-are-geocoded.mjs"]);
    ctx.run("node", ["scripts/verify-telematics-feed-is-live.mjs"]);
    // ROUND 283.3 — no unscoped listAllLoads/listLoads (fail-closed with backend else)
    ctx.run("node", ["scripts/verify-list-loads-requires-board-scope.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-list-loads-requires-board-scope.mjs"]);
  },
};
