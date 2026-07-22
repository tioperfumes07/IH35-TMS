export default {
  name: "verify-bill-payment-posting-uses-resolver",
  run(ctx) {
    // Rule 17: auto-discover existing CHAIN-04 static guard (was package.json-only orphan).
    // Locks GAP#1–#3: BILL_PAYMENT_GL_POSTING_ENABLED gate, ledger_account_id bank leg (never
    // coa_account_id), ap_control resolver, BILL_AP_NOT_POSTED refuse-before-post.
    if (ctx.run("node", ["scripts/verify-bill-payment-posting-uses-resolver.mjs"]) !== 0) {
      process.exit(1);
    }
  },
};
