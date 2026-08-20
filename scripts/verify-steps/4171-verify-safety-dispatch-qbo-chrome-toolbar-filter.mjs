// verify-steps wrapper for scripts/verify-safety-dispatch-qbo-chrome-toolbar-filter.mjs (orphan qbo_chrome guard from this session, wired
// into CI for the first time per INBOX-CC-3.md's Rule 17 orphan-wiring directive, verify-step 4171).
// Static, no DB — same shape as sibling verify-steps/*.mjs files.
export default {
  name: "verify-safety-dispatch-qbo-chrome-toolbar-filter",
  run(ctx) {
    ctx.run("node", ["scripts/verify-safety-dispatch-qbo-chrome-toolbar-filter.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-safety-dispatch-qbo-chrome-toolbar-filter.mjs"]);
  },
};
