export default {
  name: "verify-home-attention-dismiss-visible-errors",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-home-attention-dismiss-visible-errors.mjs"]);
    // BANK leftover slate refuse piggyback (F91187)
    await ctx.run("node", ["scripts/verify-geo-drvcomms-fleet-slate-leftover-chrome.mjs", "--selftest"]);
    return ctx.run("node", ["scripts/verify-geo-drvcomms-fleet-slate-leftover-chrome.mjs"]);
  },
};
