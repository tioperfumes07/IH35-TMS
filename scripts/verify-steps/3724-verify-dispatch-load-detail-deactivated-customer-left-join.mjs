/** LV-SYSTEM-AUDIT-LOAD-LINK-DEAD-END — EVEN Cursor claim 3724 */
export default {
  name: "verify-dispatch-load-detail-deactivated-customer-left-join",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-dispatch-load-detail-deactivated-customer-left-join.mjs"]);
    await ctx.run("node", ["scripts/verify-91105-cashfcst-manualje-legalcost-slate-leftover-chrome.mjs"]);
  },
};
