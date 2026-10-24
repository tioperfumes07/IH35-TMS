/**
 * CLAIMED 3126 — Cursor EVEN — verify-every-selector-multi-select (443.325 ENG-30)
 */
export default {
  name: "verify-every-selector-multi-select",
  async run(ctx) {
    ctx.run("node", ["scripts/verify-every-selector-multi-select.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-every-selector-multi-select.mjs"]);
  },
};
