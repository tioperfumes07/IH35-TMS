export default {
  name: "verify-finance-preview-datepicker",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-finance-preview-datepicker.mjs"]);
    await ctx.run("node", ["scripts/verify-safety-events-harsh-slate-leftover-chrome.mjs"]);
  },
};
