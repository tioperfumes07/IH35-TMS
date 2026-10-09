/** Verify-step 3578 — BANK-F3578 bank tx categorization ParityTable surface bar. */
export default {
  name: "verify-bank-tx-categorization-parity-surface-bar",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-bank-tx-categorization-parity-surface-bar.mjs"]);
    await ctx.run("node", ["scripts/verify-91119-vendmerge-loan-parts-slate-leftover-chrome.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-91119-vendmerge-loan-parts-slate-leftover-chrome.mjs"]);
  },
};
