// 1560-verify-route-manifest-parity — C10 (ROUTES: every defined route module is mounted; 401, not 404).
//
// A route file existing is not proof it is mounted. Eight maintenance-catalog surfaces
// (apps/backend/src/catalogs/maintenance/index.ts) were written, exported, called by the frontend —
// and never registered, so every one of them 404s in production. Nothing in the build catches that:
// TypeScript is content with an exported function nobody calls, and the unit tests import the
// registrar directly, which is exactly the wiring the app skips.
//
// Run against pre-fix origin/main this FAILS with 27 unmounted route modules. Eleven of them are
// invisible to the existing scripts/verify-no-orphan-routes.mjs, which asks only "is a function of
// this name called ANYWHERE" — that passes a module the moment a namesake in another directory is
// wired (two files export `registerApAgingRoutes`), passes default-exported plugins it never looks
// at, and passes aggregators that are not named `*.routes.ts`, including the maintenance catalogs
// that started this. This guard resolves real import specifiers from the single Fastify entrypoint
// instead, across all three wiring mechanisms the backend uses: explicit registration, @fastify/
// autoload over apps/backend/src/accounting, and `await import()`.
//
// It also enforces the owner's three pre-mount conditions on every module C10 wires — auth-gated,
// entity-scoped, and canonical-writing (no RETIRE `maint.*`) — because a mounted route writing a
// retired table is worse than the 404 it replaced. The broad RETIRE sweep is class C2's
// (1521-verify-sweep-c2-no-retire-writes.mjs); this is the narrow, C10-scoped version.
//
// The --selftest runs FIRST and is capable of failing: it plants 3 unmounted modules (a plain
// orphan, a named-export-only file in the autoload tree that autoload silently skips, and a module
// imported but never invoked), 6 correctly-mounted controls that must NOT be flagged (direct call,
// transitive group index, re-export barrel + its implementation, autoload plugin, registrar-less
// file), both arms of the shrink-only refusal ratchet, all four mount-safety arms, and finally
// unwires the entrypoint to prove a clean module then fails.
export default {
  name: "verify-route-manifest-parity",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-route-manifest-parity.mjs", "--selftest"]);
    return ctx.run("node", ["scripts/verify-route-manifest-parity.mjs"]);
  },
};
