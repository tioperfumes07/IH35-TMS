// verify-steps wrapper for scripts/verify-parity-drawer-z-index-above-modal.mjs (mirror lock of
// verify-modal-z-index-above-drawers.mjs — caught the ParityDrawer stackAboveModal z-index
// regression fixed in the previous PR (LV-WO-PARTPANEL-BEHIND-MODAL-DESTROYS-FORM reopened by an
// unrelated Modal.tsx z-index bump), wired into CI for the first time per the standard Rule 37
// claim-then-author pattern, verify-step 4179). Static, no DB — same shape as sibling
// verify-steps/*.mjs files.
export default {
  name: "verify-parity-drawer-z-index-above-modal",
  run(ctx) {
    ctx.run("node", ["scripts/verify-parity-drawer-z-index-above-modal.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-parity-drawer-z-index-above-modal.mjs"]);
  },
};
