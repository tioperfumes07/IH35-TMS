// verify-steps wrapper for scripts/verify-no-uncast-operating-company-id.mjs
// (CLS-UNCAST-OPCO-UUID, verify-step 3183). Same shape as
// verify-steps/3179-verify-safety-temp-cover-assignments-wired.mjs — the guard is a standalone
// scripts/verify-*.mjs (static, no DB needed) and this wrapper is what makes it FULLY WIRED per
// verify-guard-wired.mjs.
export default {
  name: "verify-no-uncast-operating-company-id",
  run(ctx) {
    ctx.run("node", ["scripts/verify-no-uncast-operating-company-id.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-no-uncast-operating-company-id.mjs"]);
  },
};
