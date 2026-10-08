export default {
  name: "verify-lists-back-to-main-hub",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-lists-back-to-main-hub.mjs"]);
    // BANK leftover refuse — ReclassifyTransactions / AccountsPayableAging / LoanApplicationWizard house tokens
    await ctx.run("node", ["scripts/verify-91054-reclass-ap-loan-slate-leftover-chrome.mjs"]);
  },
};
