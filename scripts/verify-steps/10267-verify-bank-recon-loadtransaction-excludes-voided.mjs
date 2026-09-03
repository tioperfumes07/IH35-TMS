/** CC-2 — BANK-F9998 finding F2 (BLOCKER). accounting/bank-recon/match.service.ts's loadTransaction
 * never filtered bt.voided_at, so a voided bank_transactions row (including one voided as a
 * confirmed duplicate, BANK-F9997 / PR #20142's 48 rows) stayed reachable through the Match drawer's
 * candidate fetch and Confirm/accept-match path. Fixed by excluding voided_at IS NULL at the single
 * shared row-loader both call sites use. */
export default {
  name: "verify-bank-recon-loadtransaction-excludes-voided",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-bank-recon-loadtransaction-excludes-voided.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-bank-recon-loadtransaction-excludes-voided.mjs"]);
  },
};
