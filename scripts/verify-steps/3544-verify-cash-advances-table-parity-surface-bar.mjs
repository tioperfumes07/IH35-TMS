/** Verify-step 3544 — SETL-F3544 cash advances table ParityTable surface bar. */
export default {
  name: "verify-cash-advances-table-parity-surface-bar",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-cash-advances-table-parity-surface-bar.mjs"]);
    ctx.run("node", ["scripts/verify-drv-settings-loads-onboard-slate-leftover-chrome.mjs"]);
  },
};
