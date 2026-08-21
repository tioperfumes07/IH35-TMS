// verify-steps wrapper for scripts/verify-picker-law-deep-child-real-accounting-dispatch.mjs
// (3 more picker_law leaves — accounting.modal.invoice_create, accounting.parity.invoice_create,
// accounting.modal.record_expense, dispatch.wizard.border_crossing_wizard_page — closing
// guard-organization theater where the top-level surface_path file is real and correct but the
// actual EntityPicker/ReferenceSelect wiring lives a few components deep, never opened by the broad
// verify-cursor-vertical-qbo-picker-modules.mjs sweep), verify-step 4186, Rule 37 claim-then-author
// pattern (claim shipped in #13387). Static, no DB — same shape as sibling verify-steps/*.mjs files.
export default {
  name: "verify-picker-law-deep-child-real-accounting-dispatch",
  run(ctx) {
    ctx.run("node", ["scripts/verify-picker-law-deep-child-real-accounting-dispatch.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-picker-law-deep-child-real-accounting-dispatch.mjs"]);
  },
};
