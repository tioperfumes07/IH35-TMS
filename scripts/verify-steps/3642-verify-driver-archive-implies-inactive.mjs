export default {
  name: "verify-driver-archive-implies-inactive",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-driver-archive-implies-inactive.mjs"]);
    await ctx.run("node", ["scripts/verify-91059-prepaid-calc-audit-slate-leftover-chrome.mjs"]);
  },
};
