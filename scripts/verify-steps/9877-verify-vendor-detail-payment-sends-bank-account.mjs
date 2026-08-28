// verify-steps wrapper for scripts/verify-vendor-detail-payment-sends-bank-account.mjs —
// VEND-F-VENDORDETAIL-PAYMENT-NEVER-SENDS-BANK-ACCOUNT: the vendor bill payment flow must capture
// and forward bank_account_id end-to-end. Static, no DB.
export default {
  name: "verify-vendor-detail-payment-sends-bank-account",
  run(ctx) {
    ctx.run("node", ["scripts/verify-vendor-detail-payment-sends-bank-account.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-vendor-detail-payment-sends-bank-account.mjs"]);
  },
};
