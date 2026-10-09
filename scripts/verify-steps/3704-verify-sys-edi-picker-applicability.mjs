export default {
  name: "verify-sys-edi-picker-applicability",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-sys-edi-picker-applicability.mjs"]);
    await ctx.run("node", ["scripts/verify-91074-cfhome-actualproj-plaid-slate-leftover-chrome.mjs"]);
  },
};
