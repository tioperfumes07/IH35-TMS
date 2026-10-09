export default {
  name: "verify-lists-catalog-chrome-picker-wave",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-lists-catalog-chrome-picker-wave.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-lists-catalog-chrome-picker-wave.mjs"]);
    await ctx.run("node", ["scripts/verify-91182-forms-field-combobox-slate-leftover-chrome.mjs"]);
  },
};
