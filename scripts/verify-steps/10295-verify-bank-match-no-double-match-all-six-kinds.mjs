/** CC-2 — matched-state guard (BANKING-MATCH-FLOW-AUDIT Q4/F4). Proves fetchLedgerCandidates
 * excludes an already-matched document across all 6 ledger_entry_kind sources, not just the
 * original bill/expense-only pair — the app-level half of the "one document can't be matched to
 * two bank transactions" guarantee. The DB-level half (a partial unique index on
 * banking.reconciliation_matches) needs a migration and is routed to CC-1 in GUARD-WORKORDERS.md. */
export default {
  name: "verify-bank-match-no-double-match-all-six-kinds",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-bank-match-no-double-match-all-six-kinds.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-bank-match-no-double-match-all-six-kinds.mjs"]);
  },
};
