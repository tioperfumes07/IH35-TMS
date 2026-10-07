export default {
  name: "verify:ifta-step-miles-uses-paritytable",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-ifta-step-miles-uses-paritytable.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-ifta-step-miles-uses-paritytable.mjs"]);
    // BANK leftover refuse — IFTA Step1/2/4 house tokens
    await ctx.run("node", ["scripts/verify-ifta-steps-slate-leftover-chrome.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-ifta-steps-slate-leftover-chrome.mjs"]);
  },
};
