/** CC-2 — BANK-F10005 amendment (owner-ordered). banking.bank_transactions.amount_cents's sign
 * runs OPPOSITE is_credit on this table (Plaid convention: negative=credit/deposit, positive=
 * debit/withdrawal) — a schema-level trap, not a one-off. Guards that no money-direction logic
 * infers direction from sign(amount_cents); it must read is_credit instead. */
export default {
  name: "verify-bank-transactions-direction-uses-is-credit",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-bank-transactions-direction-uses-is-credit.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-bank-transactions-direction-uses-is-credit.mjs"]);
  },
};
