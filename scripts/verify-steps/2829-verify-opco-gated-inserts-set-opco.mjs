// verify-opco-gated-inserts-set-opco — ACCT-F181 (board card LV-TXN-016).
//
// On the prod branch, ten tables carry a NULLABLE `operating_company_id` whose permissive RLS
// WITH CHECK is the ONLY thing gating their writes. An INSERT naming only `tenant_id` leaves that
// column NULL, the check yields NULL rather than true, and the row is rejected 42501 — every time,
// on first use. insurance.policy shows the signature exactly: n_tup_ins 5, n_live_tup 0.
//
// Selftest first, and it is the load-bearing half here: the live check is a static scan, so the
// only thing proving it still detects anything is a planted defect. It also proves the guard does
// NOT credit a comment that merely names the column — every fix in this class ships with exactly
// such a comment beside the INSERT, so that false green was one edit away.
export default {
  name: "verify:opco-gated-inserts-set-opco",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-opco-gated-inserts-set-opco.mjs", "--selftest"]);
    return ctx.run("node", ["scripts/verify-opco-gated-inserts-set-opco.mjs"]);
  },
};
