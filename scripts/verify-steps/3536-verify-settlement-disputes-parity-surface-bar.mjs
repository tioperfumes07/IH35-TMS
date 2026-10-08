/** Verify-step 3536 — ACCT-F3536 settlement disputes ParityTable surface bar. */
export default {
  name: "verify-settlement-disputes-parity-surface-bar",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-settlement-disputes-parity-surface-bar.mjs"]);
    // BANK leftover refuse — PhotoDiffViewer/EldEditHistoryTimeline/InspectionScoreBadge house tokens
    await ctx.run("node", ["scripts/verify-safety-photo-eld-insp-slate-leftover-chrome.mjs"]);
  },
};
