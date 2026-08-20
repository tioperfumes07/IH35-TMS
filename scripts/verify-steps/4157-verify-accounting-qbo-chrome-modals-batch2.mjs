// verify-steps wrapper for scripts/verify-accounting-qbo-chrome-modals-batch2.mjs (orphan qbo_chrome guard from this session, wired
// into CI for the first time per INBOX-CC-3.md's Rule 17 orphan-wiring directive, verify-step 4157).
// Static, no DB — same shape as sibling verify-steps/*.mjs files.
export default {
  name: "verify-accounting-qbo-chrome-modals-batch2",
  run(ctx) {
    ctx.run("node", ["scripts/verify-accounting-qbo-chrome-modals-batch2.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-accounting-qbo-chrome-modals-batch2.mjs"]);
  },
};
