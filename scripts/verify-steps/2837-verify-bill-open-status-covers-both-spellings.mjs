// verify-bill-open-status-covers-both-spellings — ACCT-F183.
//
// accounting.bills.status carries BOTH 'partial' AND 'partially_paid' as live prod values. Four
// read paths matched only 'partial', so 2 bills carrying $482.95 of open balance were invisible to
// AP aging, the payables KPI, the cash forecast and the cash-flow overview — payables UNDERSTATED,
// the more dangerous direction, since an overstatement is caught by anyone reconciling.
//
// Selftest first: the live half is a static scan, so a planted defect is the only thing proving it
// still detects anything. It also proves the guard ignores the INVOICE vocabulary ('sent','partial')
// and 'open'/'partial' sets — a guard that reddens on unrelated code gets muted, and muted guards
// are how the four vacuous checks found on 2026-08-08 survived.
export default {
  name: "verify:bill-open-status-covers-both-spellings",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-bill-open-status-covers-both-spellings.mjs", "--selftest"]);
    return ctx.run("node", ["scripts/verify-bill-open-status-covers-both-spellings.mjs"]);
  },
};
