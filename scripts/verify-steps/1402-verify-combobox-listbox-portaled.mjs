/** Cursor lane verify-step 1402 — Combobox listbox portals (ParityTable clip fix). */
export default {
  name: "verify-combobox-listbox-portaled",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-shared-chrome-slate-leftover-chrome.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-shared-chrome-slate-leftover-chrome.mjs"]);
    await ctx.run("node", ["scripts/verify-combobox-listbox-portaled.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-combobox-listbox-portaled.mjs"]);
  },
};
