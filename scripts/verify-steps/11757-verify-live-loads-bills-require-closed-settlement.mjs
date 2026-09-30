// A-07 (Lead's NEXT-15-JOBS order, 2026-09-30) -- this guard passed today but ran nowhere (orphan).
// Wires the existing, already-green scripts/verify-live-loads-bills-require-closed-settlement.mjs
// into the verify-steps registry so it actually gates a push.
export default {
  name: "verify:live-loads-bills-require-closed-settlement",
  run(ctx) {
    ctx.run("node", ["scripts/verify-live-loads-bills-require-closed-settlement.mjs"]);
  },
};
