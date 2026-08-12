// verify-steps wrapper for scripts/verify-unit-insurance-linked-policies.mjs
// (P19-MODULE-12-INSURANCE-VEHICLE-PROFILE-REVERSE-LINK, verify-step 3171). Same shape as
// verify-steps/3167-verify-da-program-routes-uuid-scoped.mjs — the guard is a standalone
// scripts/verify-*.mjs (static, no DB needed) and this wrapper is what makes it FULLY WIRED per
// verify-guard-wired.mjs.
export default {
  name: "verify-unit-insurance-linked-policies",
  run(ctx) {
    ctx.run("node", ["scripts/verify-unit-insurance-linked-policies.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-unit-insurance-linked-policies.mjs"]);
  },
};
