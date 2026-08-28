// verify-steps wrapper for scripts/verify-eld-unidentified-driving-respects-stale.mjs —
// ELD-UNIDENTIFIED-STALE-FIX-NO-RECENCY-CHECK: the /eld "Unidentified Driving" filter must not
// treat a stale (>60min-old) frozen speed/engine reading as live driving. Static, no DB.
export default {
  name: "verify-eld-unidentified-driving-respects-stale",
  run(ctx) {
    ctx.run("node", ["scripts/verify-eld-unidentified-driving-respects-stale.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-eld-unidentified-driving-respects-stale.mjs"]);
  },
};
