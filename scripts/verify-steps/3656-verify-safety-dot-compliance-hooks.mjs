export default {
  name: "verify-safety-dot-compliance-hooks",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-safety-dot-compliance-hooks.mjs"]);
    await ctx.run("node", ["scripts/verify-wo-detail-create-slate-leftover-chrome.mjs"]);
  },
};
