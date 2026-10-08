export default {
  name: "verify:driver-safety-reverse-section",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-driver-safety-reverse-section.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-driver-safety-reverse-section.mjs"]);
    // BANK leftover slate refuse piggyback (F91172)
    await ctx.run("node", ["scripts/verify-safety-reverse-csa-slate-leftover-chrome.mjs", "--selftest"]);
    return ctx.run("node", ["scripts/verify-safety-reverse-csa-slate-leftover-chrome.mjs"]);
  },
};
