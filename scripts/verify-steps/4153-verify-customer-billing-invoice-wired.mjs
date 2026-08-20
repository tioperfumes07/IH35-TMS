// verify-steps wrapper for scripts/verify-customer-billing-invoice-wired.mjs
// (WAVE 1 customers money — billing invoice, verify-step 4153). Static, no DB — same shape as
// verify-steps/4152-*.mjs and siblings.
export default {
  name: "verify-customer-billing-invoice-wired",
  run(ctx) {
    ctx.run("node", ["scripts/verify-customer-billing-invoice-wired.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-customer-billing-invoice-wired.mjs"]);
  },
};
