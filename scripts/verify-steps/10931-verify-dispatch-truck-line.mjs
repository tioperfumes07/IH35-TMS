export default {
  name: "verify:dispatch-truck-line",
  run(ctx) {
    ctx.run("node", ["scripts/verify-dispatch-truck-line.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-dispatch-truck-line.mjs"]);
    // ROUND 155.6 — unit_id top-level uniqueness + CURRENT helper + sections + empty state
    ctx.run("node", ["scripts/verify-truck-line-unit-top-level-unique.mjs"]);
  },
};
