// Step 1748 — ACCT-SURF-04: Receive Payment deep structural DoD (route + ParityDrawer create
// chrome + payload + canonical accounting.payments INSERT + EntityLink customer on list+detail,
// invoice on applications, account on deposit). payment_applications density is NOT asserted here.
// Rule 17: guards wire ONLY through scripts/verify-steps/NNNN-*.mjs.
export default {
  name: "verify-acct-surf-04-receive-payment",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-acct-surf-04-receive-payment.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-acct-surf-04-receive-payment.mjs"]);
  },
};
