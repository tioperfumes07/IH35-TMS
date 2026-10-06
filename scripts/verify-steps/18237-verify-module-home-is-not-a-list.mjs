// Orphan-guard wiring per docs/bus/10-03-2026-LEAD-RULING-WIRE-THE-ORPHAN-GUARDS.md (Devin, 2026-10-05).
export default {
  name: "verify:module-home-is-not-a-list",
  run(ctx) {
    ctx.run("node", ["scripts/verify-module-home-is-not-a-list.mjs", "--selftest"]);
    return ctx.run("node", ["scripts/verify-module-home-is-not-a-list.mjs"]);
  },
};
