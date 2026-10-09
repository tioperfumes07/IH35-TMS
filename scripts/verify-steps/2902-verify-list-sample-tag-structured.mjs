export default {
  name: "verify-list-sample-tag-structured",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-list-sample-tag-structured.mjs"]);
    await ctx.run("node", ["scripts/verify-91189-audit-plaid-stops-slate-leftover-chrome.mjs"]);
  },
};
