export default {
  name: "verify-saf-csa-score-tab-query-error-surface",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-saf-csa-score-tab-query-error-surface.mjs"]);
    // BANK-F91211 piggyback — CSAScoreTab / DamageReportDetail / InternalFinesPage leftover slate refuse
    await ctx.run("node", ["scripts/verify-safety-csa-dmg-fine-slate-leftover-chrome.mjs"]);
  },
};
