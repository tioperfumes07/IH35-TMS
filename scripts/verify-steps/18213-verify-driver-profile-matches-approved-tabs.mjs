// Orphan-guard wiring per docs/bus/10-03-2026-LEAD-RULING-WIRE-THE-ORPHAN-GUARDS.md (Devin, 2026-10-05).
export default {
  name: "verify:driver-profile-matches-approved-tabs",
  run(ctx) {
    ctx.run("node", ["scripts/verify-driver-profile-matches-approved-tabs.mjs", "--selftest"]);
    return ctx.run("node", ["scripts/verify-driver-profile-matches-approved-tabs.mjs"]);
  },
};
