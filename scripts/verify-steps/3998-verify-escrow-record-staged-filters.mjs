export default {
  name: "verify-escrow-record-staged-filters",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-escrow-record-staged-filters.mjs"]);
    // BANK leftover slate refuse piggyback (F91190)
    await ctx.run("node", ["scripts/verify-status-attn-escrow-slate-leftover-chrome.mjs", "--selftest"]);
    return ctx.run("node", ["scripts/verify-status-attn-escrow-slate-leftover-chrome.mjs"]);
  },
};
