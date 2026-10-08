export default {
  name: "verify-matrix-live-leaf-explicit",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-matrix-live-leaf-explicit.mjs"]);
    await ctx.run("node", ["scripts/verify-matrix-live-leaf-explicit.mjs", "--selftest"]);
    // BANK leftover refuse — SafetyGroupNav / ComplianceTable / LoadHistoryTab house tokens
    await ctx.run("node", ["scripts/verify-91284-safety-comp-loadhist-slate-leftover-chrome.mjs"]);
  },
};
