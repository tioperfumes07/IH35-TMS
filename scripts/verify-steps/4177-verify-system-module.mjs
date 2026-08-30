// verify-steps wrapper for scripts/verify-system-module.mjs (orphan qbo_chrome guard found during a
// content-based sweep of every scripts/verify-*.mjs carrying a real qbo_chrome matrix-built claim,
// wired into CI for the first time per INBOX-CC-3.md's Rule 17 orphan-wiring directive, verify-step
// 4177). Static, no DB — same shape as sibling verify-steps/*.mjs files.
export default {
  name: "verify-system-module",
  run(ctx) {
    ctx.run("node", ["scripts/verify-system-module.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-system-module.mjs"]);
    ctx.run("node", ["scripts/verify-transaction-health-evidence-company-scope.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-transaction-health-evidence-company-scope.mjs"]);
    ctx.run("node", ["scripts/verify-transaction-health-register-company-scope.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-transaction-health-register-company-scope.mjs"]);
  },
};
