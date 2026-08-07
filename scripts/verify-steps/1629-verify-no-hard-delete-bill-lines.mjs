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
  },
};
