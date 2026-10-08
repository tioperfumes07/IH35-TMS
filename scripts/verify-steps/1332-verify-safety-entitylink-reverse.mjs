export default {
  name: "verify:safety-entitylink-reverse",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-safety-entitylink-reverse.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-safety-internal-fines-detail-chrome.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-safety-internal-fines-detail-chrome.mjs"]);
    await ctx.run("node", ["scripts/verify-safety-entitylink-reverse.mjs"]);
    // BANK leftover slate refuse piggyback (F91196)
    await ctx.run("node", ["scripts/verify-safety-rev-filings-slate-leftover-chrome.mjs", "--selftest"]);
    return ctx.run("node", ["scripts/verify-safety-rev-filings-slate-leftover-chrome.mjs"]);
  },
};
