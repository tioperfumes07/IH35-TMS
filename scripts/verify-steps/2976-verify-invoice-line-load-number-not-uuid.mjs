export default {
  name: "verify-invoice-line-load-number-not-uuid",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-invoice-line-load-number-not-uuid.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-invoice-line-load-number-not-uuid.mjs"]);
    await ctx.run("node", ["scripts/verify-91172-dispatch-stops-xfer-slate-leftover-chrome.mjs"]);
  },
};
