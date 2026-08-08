// verify-void-zeroes-open-balance — ACCT-F197 (Cascade FAIL-A1).
//
// The invoice void route set status='void' and voided_at=now() and left amount_open_cents at its
// full value, so every surface summing that column kept counting a receivable nobody owes. All 7
// voided USMCA invoices carried their full balance — $3,983.07, 56.4% of the entity's reported A/R.
//
// The guard asserts the zeroing AND that the void itself still happens: a check that only looked for
// `amount_open_cents = 0` would pass a route that had stopped setting status='void' altogether.
//
// Selftest first, and one of its four cases is a COMMENTED-OUT zeroing — because this fix ships with
// a long explanatory comment naming that exact token, and a parser that did not strip comments would
// pass on the prose after the code was removed.
export default {
  name: "verify:void-zeroes-open-balance",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-void-zeroes-open-balance.mjs", "--selftest"]);
    return ctx.run("node", ["scripts/verify-void-zeroes-open-balance.mjs"]);
  },
};
