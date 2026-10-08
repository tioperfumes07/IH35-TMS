export default {
  name: "verify-inventory-part-create-save-readiness",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-inventory-part-create-save-readiness.mjs"]);
    await ctx.run("node", ["scripts/verify-fuel-integ-receipt-relay-slate-leftover-chrome.mjs"]);
  },
};
