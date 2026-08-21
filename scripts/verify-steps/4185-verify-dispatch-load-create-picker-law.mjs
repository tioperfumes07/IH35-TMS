// verify-steps wrapper for scripts/verify-dispatch-load-create-picker-law.mjs
// (dispatch.modal.load_create picker_law — closes a guard-organization-theater gap: the leaf's
// surface_path pointed at a nested repair-availability sub-dialog instead of the real load-creation
// form, and the only crediting guard, verify-cursor-vertical-qbo-picker-modules.mjs, never opened
// either file. The real form, BookLoadModalV4.tsx + BookLoadEquipmentSection.tsx, has genuine
// customer/vendor/unit/driver pickers — this guard asserts them directly), verify-step 4185, Rule 37
// claim-then-author pattern (claim shipped in #13378). Static, no DB — same shape as sibling
// verify-steps/*.mjs files.
export default {
  name: "verify-dispatch-load-create-picker-law",
  run(ctx) {
    ctx.run("node", ["scripts/verify-dispatch-load-create-picker-law.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-dispatch-load-create-picker-law.mjs"]);
  },
};
