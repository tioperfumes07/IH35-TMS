export default {
  name: "verify-users-detail-default-company-label",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-users-detail-default-company-label.mjs"]);
    await ctx.run("node", ["scripts/verify-91063-coa-proj-bankvis-slate-leftover-chrome.mjs"]);
  },
};
