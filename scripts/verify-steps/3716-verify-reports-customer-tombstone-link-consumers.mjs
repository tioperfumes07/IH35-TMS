export default {
  name: "verify-reports-customer-tombstone-link-consumers",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-reports-customer-tombstone-link-consumers.mjs"]);
    await ctx.run("node", ["scripts/verify-91109-u14-payroll-comp425c-slate-leftover-chrome.mjs"]);
  },
};
