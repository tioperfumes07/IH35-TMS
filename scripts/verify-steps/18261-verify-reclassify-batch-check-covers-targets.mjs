// Orphan-guard wiring per docs/bus/10-03-2026-LEAD-RULING-WIRE-THE-ORPHAN-GUARDS.md (Devin, 2026-10-05).
export default {
  name: "verify:reclassify-batch-check-covers-targets",
  run(ctx) {
    return ctx.run("node", ["scripts/verify-reclassify-batch-check-covers-targets.mjs"]);
  },
};
