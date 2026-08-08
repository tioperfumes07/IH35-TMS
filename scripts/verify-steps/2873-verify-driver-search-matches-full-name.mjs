// verify-driver-search-matches-full-name — ACCT-F203 (board card FAIL-D1).
//
// The driver list search matched first_name / last_name / cdl_number SEPARATELY, so typing a driver's
// whole name — the single most natural thing a dispatcher does — returned nothing. Proven on prod:
// '%Juan USMCA%' scores 0 against those three columns while the concatenated name matches exactly one
// driver.
//
// That is what turned a search annoyance into a dispatch blocker. The list defaults to LIMIT 50 and
// prod holds 92 USMCA / 96 TRANSP drivers, so past the cap search is the ONLY way to reach someone —
// and search was the broken part. The picker looked empty and Assign could not proceed.
//
// The guard asserts BOTH name orders and the NULL-safety, because those are two different failures.
// last_name is nullable and 'Juan' || ' ' || NULL is NULL in SQL, so an unguarded concatenation would
// silently drop every driver missing a surname FROM THEIR OWN SEARCH — a subtly wrong result rather
// than an obviously broken one, and one that a naive "is there a concatenation?" check would pass.
export default {
  name: "verify:driver-search-matches-full-name",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-driver-search-matches-full-name.mjs", "--selftest"]);
    return ctx.run("node", ["scripts/verify-driver-search-matches-full-name.mjs"]);
  },
};
