export default {
  name: "verify-reports-account-type-human-labels",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-reports-account-type-human-labels.mjs"]);
    await ctx.run("node", ["scripts/verify-91103-fueltx-fuelfraud-totals-slate-leftover-chrome.mjs"]);
  },
};
