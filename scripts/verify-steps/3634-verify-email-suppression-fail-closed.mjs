// verify-steps wrapper — LV-EMAIL-SUPPRESSION-FAILS-OPEN · claim 3634
export default {
  name: "verify-email-suppression-fail-closed",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-email-suppression-fail-closed.mjs"]);
    await ctx.run("node", ["scripts/verify-91057-catalog-breakeven-reimb-slate-leftover-chrome.mjs"]);
  },
};
