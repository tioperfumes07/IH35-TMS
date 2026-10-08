export default {
  name: "verify-ifta-step-miles-uses-paritytable",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-ifta-step-miles-uses-paritytable.mjs"]);
    // BANK leftover slate refuse piggyback (F91188)
    await ctx.run("node", ["scripts/verify-ifta-steps-slate-leftover-chrome.mjs", "--selftest"]);
    return ctx.run("node", ["scripts/verify-ifta-steps-slate-leftover-chrome.mjs"]);
  },
};
