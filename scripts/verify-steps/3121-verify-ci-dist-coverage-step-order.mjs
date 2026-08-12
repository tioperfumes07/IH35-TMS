// verify-steps wrapper for scripts/verify-ci-dist-coverage-step-order.mjs
// (CI-DIST-COVERAGE, verify-step 3121). Same shape as
// verify-steps/3109-verify-flag-keys-seeded.mjs / 3113-*.mjs / 3117-*.mjs — the guard is a standalone
// scripts/verify-*.mjs (static, no DB needed) and this wrapper is what makes it FULLY WIRED per
// verify-guard-wired.mjs.
export default {
  name: "verify-ci-dist-coverage-step-order",
  run(ctx) {
    ctx.run("node", ["scripts/verify-ci-dist-coverage-step-order.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-ci-dist-coverage-step-order.mjs"]);
  },
};
