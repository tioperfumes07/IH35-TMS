export default {
  name: "verify:pod-review-entity-tombstones",
  run(ctx) {
    ctx.run("node", ["scripts/verify-pod-review-entity-tombstones.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-pod-review-entity-tombstones.mjs"]);
    // BANK-F91516 — PlannerGrid --rule-day leftover #94a3b8 refuse (10481 is ODD).
    // BANK-F91524 — leftover .pg-dwell border #cbd5e1 → house #E5E7EB.
    ctx.run("node", ["scripts/verify-planner-column-lines.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-planner-column-lines.mjs"]);
  },
};
