// verify-steps wrapper for scripts/verify-money-kpi-strip-no-fake-zero-on-error.mjs
// (CLS-MONEY-KPI-FAKE-ZERO-ON-FAILURE, verify-step 3151). Same shape as
// verify-steps/3123-verify-driver-profile-settlement-reverse-link.mjs — the guard is a standalone
// scripts/verify-*.mjs (static, no DB needed) and this wrapper is what makes it FULLY WIRED per
// verify-guard-wired.mjs.
export default {
  name: "verify-money-kpi-strip-no-fake-zero-on-error",
  run(ctx) {
    ctx.run("node", ["scripts/verify-money-kpi-strip-no-fake-zero-on-error.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-money-kpi-strip-no-fake-zero-on-error.mjs"]);
  },
};
