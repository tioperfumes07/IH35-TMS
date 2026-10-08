export default {
  name: "verify-drug-alcohol-staged-filters",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-drug-alcohol-staged-filters.mjs"]);
    // BANK-F91201 piggyback — SafetyReports / TestScheduling / DriverScoring leftover slate refuse
    await ctx.run("node", ["scripts/verify-safety-rpt-score-slate-leftover-chrome.mjs"]);
  },
};
