// SETL-SELECTION-BINDING reopened (CASCADE-SELECTION-BINDING-SWEEP-2026-09-01). Step 10205 · CC-1 lane.
export default {
  name: "settlement-detail-identity-guard",
  run(ctx) {
    ctx.run("node", ["scripts/verify-settlement-detail-identity-guard.mjs", "--selftest"]);
    return ctx.run("node", ["scripts/verify-settlement-detail-identity-guard.mjs"]);
  },
};
