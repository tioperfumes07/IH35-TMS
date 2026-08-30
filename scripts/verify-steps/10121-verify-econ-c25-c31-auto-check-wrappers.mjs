/**
 * The 6 economics auto_check wrapper scripts (C25/C26/C27/C29/C30/C31 -- C28 has its own
 * pre-existing wrapper) plus the column-mapping guard protecting their --live delegation from
 * silently pointing at the wrong ECON_PROOFS entry. No DATABASE_URL in this CI lane, so only
 * the default FAIL-CLOSED path + --selftest run here -- --live is exercised manually against
 * real prod (see ACCT-F10125's own commit for the connected run's raw output).
 */
export default {
  name: "verify-econ-c25-c31-auto-check-wrappers",
  async run(ctx) {
    for (const name of [
      "verify-gl-delta-matches-matrix",
      "verify-subledger-tieout",
      "verify-no-stranded-intermediate",
      "verify-period-and-date-guard",
      "verify-posting-flag-has-roles",
      "verify-non-empty-certification",
    ]) {
      await ctx.run("node", [`scripts/${name}.mjs`, "--selftest"]);
    }
    await ctx.run("node", ["scripts/verify-econ-auto-check-wrappers-column-mapping.mjs"]);
    await ctx.run("node", ["scripts/verify-econ-auto-check-wrappers-column-mapping.mjs", "--selftest"]);
  },
};
