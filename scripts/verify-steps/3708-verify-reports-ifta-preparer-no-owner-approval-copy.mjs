export default {
  name: "verify-reports-ifta-preparer-no-owner-approval-copy",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-reports-ifta-preparer-no-owner-approval-copy.mjs"]);
    // BANK-F91213 piggyback — IFTAPreparer / IFTAStepTax / Step3JurisdictionCalc leftover slate refuse
    await ctx.run("node", ["scripts/verify-ifta-prep-tax-jurisdiction-slate-leftover-chrome.mjs"]);
  },
};
