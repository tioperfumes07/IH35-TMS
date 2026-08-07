/** F9-02 — never hard-DELETE accounting.bill_lines (void orphans). */
export default {
  name: "verify-no-hard-delete-bill-lines",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-no-hard-delete-bill-lines.mjs"]);
    await ctx.run("node", ["scripts/verify-no-hard-delete-bill-lines.mjs", "--selftest"]);

    // ACCT-F152 — the shrink-only WORM coverage ratchet that ACCT-F141 (#4607) promised in its own
    // header ("verified ... by the shrink-only ratchet 2729-verify-financial-tables-not-deletable.mjs")
    // and never shipped. Where the check above forbids a hard DELETE on ONE table in application
    // source, this one watches the DATABASE-level control across all 141 financial tables: no table
    // may lose WORM protection, and the unprotected count may only shrink. Hosted here rather than on
    // a new number because Rule 37 requires the number be claimed on main first and CLAIMED-NUMBERS.json
    // is held by another open PR (Rule 26); same family of invariant, so it belongs with this step.
    await ctx.run("node", ["scripts/verify-worm-coverage-ratchet.mjs"]);
    await ctx.run("node", ["scripts/verify-worm-coverage-ratchet.mjs", "--selftest"]);

    // ACCT-F156 — the OTHER half of void-not-delete. The checks above stop a financial row being
    // DELETED; this one stops a voided row being COUNTED. Verifying the AP tie-out on prod, 3 bills
    // appeared to drift $235.00 and every "drift" was exactly a voided bill_line still inside the sum;
    // filtered, 16,256 of 16,258 tie to the cent with 0 drift. Six live sites had the same gap,
    // including recomputeInvoiceTotals — an invoice header that would not shrink when a line is
    // soft-deleted. Same invariant family as this step, so it is hosted here.
    await ctx.run("node", ["scripts/verify-money-line-sums-exclude-voided.mjs"]);
    await ctx.run("node", ["scripts/verify-money-line-sums-exclude-voided.mjs", "--selftest"]);

    // ACCT-F157 — keep the canonical void-predicate map honest. "Exclude the voided row" had TEN
    // spellings across the backend, which made the invariant above UNGUARDABLE beyond the three line
    // tables: three sweep rounds (114 -> 82 -> 44 sites) shrank only as each new spelling was learned,
    // and the two sites hand-checked at 44 were BOTH correct code. docs/audit/void-predicate-map.json
    // is the missing fact — one canonical predicate per financial table, generated from prod. This
    // guard stops it drifting, because a map callers TRUST but that has drifted is worse than no map.
    await ctx.run("node", ["scripts/verify-void-predicate-map-current.mjs"]);
    await ctx.run("node", ["scripts/verify-void-predicate-map-current.mjs", "--selftest"]);
  },
};
