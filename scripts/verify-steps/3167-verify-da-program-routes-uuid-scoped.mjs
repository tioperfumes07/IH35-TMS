// verify-steps wrapper for scripts/verify-da-program-routes-uuid-scoped.mjs
// (DA-PROGRAM-ROUTES-500-MISSING-UUID-CAST, verify-step 3167). Same shape as
// verify-steps/3163-verify-qbo-oauth-redirect-uri-not-logged.mjs — the guard is a standalone
// scripts/verify-*.mjs (static, no DB needed) and this wrapper is what makes it FULLY WIRED per
// verify-guard-wired.mjs.
export default {
  name: "verify-da-program-routes-uuid-scoped",
  run(ctx) {
    ctx.run("node", ["scripts/verify-da-program-routes-uuid-scoped.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-da-program-routes-uuid-scoped.mjs"]);
  },
};
