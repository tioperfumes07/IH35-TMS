export default {
  name: "verify-abandonment-report-modal-entitylinks",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-abandonment-report-modal-entitylinks.mjs"]);
    // BANK-F91210 piggyback — AbandonmentReportModal / RoundTrips / Dispatch leftover slate refuse
    await ctx.run("node", ["scripts/verify-abandon-rt-disp-slate-leftover-chrome.mjs"]);
  },
};
