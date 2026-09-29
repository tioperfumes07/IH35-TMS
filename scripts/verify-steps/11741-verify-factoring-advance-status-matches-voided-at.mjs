// ROUND 270 (Lead, P0) — factoring_advances.status/voided_at drift permanent backstop.
export default {
  name: "verify:factoring-advance-status-matches-voided-at",
  run(ctx) {
    ctx.run("node", ["scripts/verify-factoring-advance-status-matches-voided-at.mjs", "--selftest"]);
    return ctx.run("node", ["scripts/verify-factoring-advance-status-matches-voided-at.mjs"]);
  },
};
