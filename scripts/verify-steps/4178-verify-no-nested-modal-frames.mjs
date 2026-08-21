// verify-steps wrapper for scripts/verify-no-nested-modal-frames.mjs (P8-AUDIT-NESTED-MODALS
// chrome-law guard — caught a genuine box-in-box regression fixed earlier this session
// (AddPartsLinkModal -> AddPartsLinkDrawer), wired into CI for the first time per the same Rule 17
// orphan-wiring pattern used for the qbo_chrome guards, verify-step 4178). Static, no DB — same
// shape as sibling verify-steps/*.mjs files.
export default {
  name: "verify-no-nested-modal-frames",
  run(ctx) {
    ctx.run("node", ["scripts/verify-no-nested-modal-frames.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-no-nested-modal-frames.mjs"]);
    ctx.run("node", ["scripts/verify-secondary-nav-tabs-overflow-hit-target.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-secondary-nav-tabs-overflow-hit-target.mjs"]);
  },
};
