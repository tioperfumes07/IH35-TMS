// verify-steps wrapper for scripts/verify-collapsed-list-filters-apply.mjs (orphan qbo_chrome guard found during a
// content-based sweep of every scripts/verify-*.mjs carrying a real qbo_chrome matrix-built claim,
// wired into CI for the first time per INBOX-CC-3.md's Rule 17 orphan-wiring directive, verify-step
// 4175). Static, no DB — same shape as sibling verify-steps/*.mjs files.
export default {
  name: "verify-collapsed-list-filters-apply",
  run(ctx) {
    ctx.run("node", ["scripts/verify-collapsed-list-filters-apply.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-collapsed-list-filters-apply.mjs"]);
  },
};
