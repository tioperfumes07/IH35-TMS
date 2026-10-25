// ENG-46 (443.328): posted bill_payments on USMCA must have a JE posting with
// source_transaction_type='bill_payment' and source_transaction_id=bp.id (spine link).
// Shrink-only ratchet; ceiling 223 measured 2026-10-25.
// CC-1 band (mod4=1), claimed 2026-10-25 as 18821.
export default {
  name: "verify-bill-payment-has-spine-link",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-bill-payment-has-spine-link.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-bill-payment-has-spine-link.mjs"]);
  },
};
