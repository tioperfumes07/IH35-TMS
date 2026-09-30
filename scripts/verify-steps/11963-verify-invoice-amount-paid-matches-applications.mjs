/**
 * ROUND 300 B-31 (Lead order): traced the A/R overstatement's full chain; this locks the one
 * link proven clean live (payment_applications -> invoice.amount_paid_cents, 0/110 mismatches)
 * so a future regression there is caught immediately. Verify-step 11963, CC-2 band (mod-4 ≡3).
 */
export default {
  name: "verify-invoice-amount-paid-matches-applications",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-invoice-amount-paid-matches-applications.mjs"]);
  },
};
