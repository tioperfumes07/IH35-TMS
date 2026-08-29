// verify-steps wrapper for scripts/verify-book-load-authgate-entity-labels.mjs
// (Dispatch U6 item 3/3, AUTHGATE-PANEL-MISSING-ENTITY-LABELS — BookLoadModalV4's <AuthGatePanel>
// received unitUuid/driverUuid/trailerUuid but never the matching unitLabel/driverLabel/trailerLabel,
// so its EntityLinkOrTombstone always fell back to id-only "Unit — not visible" even though
// BookLoadEquipmentSection (a sibling in the same tree) already resolved the real label. Fixed by
// lifting the resolved EntityPickerOption up via a new onOptionsResolved callback), verify-step 4200,
// Rule 37 claim-then-author pattern (claim shipped in #13616). Static, no DB.
export default {
  name: "verify-book-load-authgate-entity-labels",
  run(ctx) {
    ctx.run("node", ["scripts/verify-book-load-authgate-entity-labels.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-book-load-authgate-entity-labels.mjs"]);
    ctx.run("node", ["scripts/verify-modal-close-retracts-url.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-modal-close-retracts-url.mjs"]);
  },
};
