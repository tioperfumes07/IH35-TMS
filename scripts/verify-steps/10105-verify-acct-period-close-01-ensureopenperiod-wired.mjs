/** ACCT-PERIOD-CLOSE-01 -- the 4 missing JE-insert choke points now call ensureOpenPeriod. */
export default {
  name: "verify-acct-period-close-01-ensureopenperiod-wired",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-acct-period-close-01-ensureopenperiod-wired.mjs"]);
    await ctx.run("node", ["scripts/verify-acct-period-close-01-ensureopenperiod-wired.mjs", "--selftest"]);
  },
};
