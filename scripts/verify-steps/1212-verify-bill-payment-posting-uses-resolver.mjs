export default {
  name: "verify-bill-payment-posting-uses-resolver",
  run(ctx) {
    // Rule 17: auto-discover existing CHAIN-04 static guard (was package.json-only orphan).
    // Locks GAP#1–#3: BILL_PAYMENT_GL_POSTING_ENABLED gate, ledger_account_id bank leg (never
    // coa_account_id), ap_control resolver, BILL_AP_NOT_POSTED refuse-before-post.
    if (ctx.run("node", ["scripts/verify-bill-payment-posting-uses-resolver.mjs"]) !== 0) {
      process.exit(1);
    }

    // CLS-SUBLEDGER-GL-DARK (ACCT-F150 / ACCT-F151) — the A/R twin of the check above. Where that
    // guard locks HOW a bill payment posts, this one locks THAT a customer receipt posts at all: a
    // route writing accounting.payments + accounting.payment_applications moves the A/R subledger, and
    // if it never calls the posting engine the GL silently stays behind. Found live (USMCA payment
    // a0b83bf5 applied $250.00 and produced zero postings) and confirmed as a class — a backend-wide
    // sweep found a second route with the identical shape. Hosted on this step rather than a new
    // number because Rule 37 requires the number be claimed on main first and CLAIMED-NUMBERS.json is
    // held by another open PR (Rule 26).
    if (ctx.run("node", ["scripts/verify-subledger-writes-post-to-gl.mjs"]) !== 0) {
      process.exit(1);
    }
  },
};
