// verify-steps wrapper for scripts/verify-confirm-discard-dialog-z-index-above-modal.mjs (mirror
// lock of verify-parity-drawer-z-index-above-modal.mjs — caught ConfirmDiscardDialog's z-index
// regression fixed in the previous PR, invisible-behind-Modal's-own-backdrop bug), wired into CI
// for the first time per the standard Rule 37 claim-then-author pattern, verify-step 4180.
// Static, no DB — same shape as sibling verify-steps/*.mjs files.
export default {
  name: "verify-confirm-discard-dialog-z-index-above-modal",
  run(ctx) {
    ctx.run("node", ["scripts/verify-confirm-discard-dialog-z-index-above-modal.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-confirm-discard-dialog-z-index-above-modal.mjs"]);
  },
};
