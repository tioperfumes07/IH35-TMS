// CLS-BOX-IN-BOX — shared SelectCombobox single-frame vertical class (Codex claim 3434).
export default {
  name: "verify-selectcombobox-single-frame-vertical",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-selectcombobox-single-frame-vertical.mjs", "--selftest"]);
    return ctx.run("node", ["scripts/verify-selectcombobox-single-frame-vertical.mjs"]);
  },
};
