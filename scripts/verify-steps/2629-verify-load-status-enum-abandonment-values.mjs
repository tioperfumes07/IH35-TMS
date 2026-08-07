// verify-load-status-enum-abandonment-values — ACCT-F117: mdata.load_status_enum lost three labels.
// 0094 added 'abandoned'/'driver_walkoff'/'driver_no_show' and is ledgered applied in BOTH ledgers,
// yet none of them are on prod — it shared one transaction with table/function/trigger DDL. Every
// existing check stayed green because they all read the ledger row instead of the database. The
// selftest runs first so a stale guard fails loudly instead of passing vacuously.
export default {
  name: "verify:load-status-enum-abandonment-values",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-load-status-enum-abandonment-values.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-load-status-enum-abandonment-values.mjs"]);
  },
};
