/** ACCT-F19367 REGRESSION GUARD — settlement + cash-advance-request display-id generators must
 * keep pg_advisory_xact_lock (fixed live 2026-09-01, PR #19374; owner FINISH-LAW assignment
 * 2026-09-03 re-verified it live on prod and closed the missing-guard gap, PR #19959). */
export default {
  name: "verify-settlement-display-id-advisory-lock",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-settlement-display-id-advisory-lock.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-settlement-display-id-advisory-lock.mjs"]);
  },
};
