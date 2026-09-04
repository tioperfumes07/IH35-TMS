/** CC-2 — owner order 2026-09-04: banking.bank_transactions.review_state = 'matched' must require
 * at least one matched_*_id non-null. Guards the service-level half: every UPDATE that sets
 * review_state = 'matched' also sets a matched_*_id column in the same statement. The DB-level half
 * (a CHECK constraint) is routed to CC-1 in GUARD-WORKORDERS.md — CC-2's chrome-only lane is
 * hard-barred from authoring migrations. */
export default {
  name: "verify-matched-state-requires-matched-id",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-matched-state-requires-matched-id.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-matched-state-requires-matched-id.mjs"]);
  },
};
