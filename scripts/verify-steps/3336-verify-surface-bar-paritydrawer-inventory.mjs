export default {
  name: "verify-surface-bar-paritydrawer-inventory",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-surface-bar-paritydrawer-inventory.mjs"]);
    // BANK-F91151 piggy — InternalFine/Anomaly/CoViolCreate slate leftover refuse
    await ctx.run("node", ["scripts/verify-91151-safety-fine-anomaly-slate-leftover-chrome.mjs"]);
  },
};
