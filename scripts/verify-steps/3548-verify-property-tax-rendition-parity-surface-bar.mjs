export default {
  name: "verify-property-tax-rendition-parity-surface-bar",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-property-tax-rendition-parity-surface-bar.mjs"]);
    // BANK leftover slate refuse piggyback (F91180)
    await ctx.run("node", ["scripts/verify-vendor-map-proptax-attn-slate-leftover-chrome.mjs", "--selftest"]);
    return ctx.run("node", ["scripts/verify-vendor-map-proptax-attn-slate-leftover-chrome.mjs"]);
  },
};
