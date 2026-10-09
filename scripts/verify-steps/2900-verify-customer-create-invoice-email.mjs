export default {
  name: "verify-customer-create-invoice-email",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-customer-create-invoice-email.mjs"]);
    await ctx.run("node", ["scripts/verify-91190-dispatch-empty-company-slate-leftover-chrome.mjs"]);
  },
};
