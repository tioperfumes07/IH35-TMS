export default {
  name: "verify-coa-account-type-qbo-finer-picker",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-coa-account-type-qbo-finer-picker.mjs"]);
    // BANK leftover refuse — AccountDrawer / TransactionRegister / FactoringDetail house tokens
    await ctx.run("node", ["scripts/verify-91053-acctdrawer-txnreg-fact-slate-leftover-chrome.mjs"]);
  },
};
