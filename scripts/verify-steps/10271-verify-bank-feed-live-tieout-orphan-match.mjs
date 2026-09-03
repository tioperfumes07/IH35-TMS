/** CC-2 — BANK-F10000. scripts/verify-bank-feed-live-tieout.mjs already asserted the exact
 * invariant that caught this (review_state='matched' requires at least one matched_*_id) but was
 * never wired into any verify-step, so it never ran in CI — a written-but-never-run guard, same
 * class as the load-costs-board fix earlier this session. It caught 126 USMCA
 * banking.bank_transactions rows stamped review_state='matched' by a single direct-SQL write (no
 * app code path, no audit event) with every matched_*_id NULL; reset live to review_state=
 * 'for_review'. This wraps the pre-existing script's --selftest + live run so the check actually
 * executes going forward. */
export default {
  name: "verify-bank-feed-live-tieout-orphan-match",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-bank-feed-live-tieout.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-bank-feed-live-tieout.mjs"]);
  },
};
