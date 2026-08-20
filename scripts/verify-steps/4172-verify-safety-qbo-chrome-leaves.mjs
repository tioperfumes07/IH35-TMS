// verify-steps wrapper for scripts/verify-safety-qbo-chrome-leaves.mjs (orphan qbo_chrome guard from this session, wired
// into CI for the first time per INBOX-CC-3.md's Rule 17 orphan-wiring directive, verify-step 4172).
// Static, no DB — same shape as sibling verify-steps/*.mjs files.
export default {
  name: "verify-safety-qbo-chrome-leaves",
  run(ctx) {
    ctx.run("node", ["scripts/verify-safety-qbo-chrome-leaves.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-safety-qbo-chrome-leaves.mjs"]);
  },
};
