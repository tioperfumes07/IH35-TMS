// verify-steps wrapper for scripts/verify-parity-drawer-escape-yields-to-open-combobox.mjs
// (Fleet chrome-law item-8 audit, live-reproduced 2026-08-21 checking Miss-C dispatch->fleet->
// lists->maintenance order: Fleet's "+ Create Unit" drawer's Owner Company Combobox — pressing
// Escape while the dropdown was open discarded the WHOLE drawer, including a typed Unit Number,
// instead of just closing the dropdown. Fixed ParityDrawer's capture-phase Escape listener to
// step aside when a Combobox listbox portal is open), verify-step 4194, Rule 37 claim-then-author
// pattern (claim shipped in #13568). Static, no DB — same shape as sibling verify-steps/*.mjs files.
export default {
  name: "verify-parity-drawer-escape-yields-to-open-combobox",
  run(ctx) {
    ctx.run("node", ["scripts/verify-parity-drawer-escape-yields-to-open-combobox.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-parity-drawer-escape-yields-to-open-combobox.mjs"]);
  },
};
