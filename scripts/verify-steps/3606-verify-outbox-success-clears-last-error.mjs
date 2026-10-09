// verify-steps wrapper — LV-OUTBOX-ERRCOL · claim 3606
export default {
  name: "verify-outbox-success-clears-last-error",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-outbox-success-clears-last-error.mjs"]);
    await ctx.run("node", ["scripts/verify-91112-paybill-expdet-invrev-slate-leftover-chrome.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-91112-paybill-expdet-invrev-slate-leftover-chrome.mjs"]);
  },
};
