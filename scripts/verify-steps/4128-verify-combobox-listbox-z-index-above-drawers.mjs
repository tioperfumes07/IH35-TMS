export default {
  name: "verify:combobox-listbox-z-index-above-drawers",
  run(ctx) {
    ctx.run("node", ["scripts/verify-combobox-listbox-z-index-above-drawers.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-combobox-listbox-z-index-above-drawers.mjs"]);
  },
};
