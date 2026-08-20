// verify-steps wrapper for scripts/verify-legal-qbo-chrome-leaves.mjs (orphan qbo_chrome guard from this session, wired
// into CI for the first time per INBOX-CC-3.md's Rule 17 orphan-wiring directive, verify-step 4168).
// Static, no DB — same shape as sibling verify-steps/*.mjs files.
export default {
  name: "verify-legal-qbo-chrome-leaves",
  run(ctx) {
    ctx.run("node", ["scripts/verify-legal-qbo-chrome-leaves.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-legal-qbo-chrome-leaves.mjs"]);
  },
};
