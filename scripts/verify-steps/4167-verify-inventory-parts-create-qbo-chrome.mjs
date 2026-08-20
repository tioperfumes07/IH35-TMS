// verify-steps wrapper for scripts/verify-inventory-parts-create-qbo-chrome.mjs (orphan qbo_chrome guard from this session, wired
// into CI for the first time per INBOX-CC-3.md's Rule 17 orphan-wiring directive, verify-step 4167).
// Static, no DB — same shape as sibling verify-steps/*.mjs files.
export default {
  name: "verify-inventory-parts-create-qbo-chrome",
  run(ctx) {
    ctx.run("node", ["scripts/verify-inventory-parts-create-qbo-chrome.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-inventory-parts-create-qbo-chrome.mjs"]);
  },
};
