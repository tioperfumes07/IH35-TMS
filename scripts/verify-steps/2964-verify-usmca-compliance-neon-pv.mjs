export default {
  name: "verify:usmca-compliance-neon-pv",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-usmca-compliance-neon-pv.mjs"]);
    await ctx.run("node", ["scripts/verify-91178-banking-chrome-slate-leftover-chrome.mjs"]);
  },
};
