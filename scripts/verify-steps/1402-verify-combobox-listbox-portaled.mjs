/** Cursor lane verify-step 1402 — Combobox listbox portals (ParityTable clip fix). */
export default {
  name: "verify-combobox-listbox-portaled",
  async run(ctx) {
    ctx.run("node", ["scripts/verify-combobox-listbox-portaled.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-combobox-listbox-portaled.mjs"]);
  },
};
