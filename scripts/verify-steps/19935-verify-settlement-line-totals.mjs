// CC-2 ENG-49 — settlement line totals engine:
// reimbursements_total must equal sum of reimbursement lines (ceiling 0 strict);
// deductions_total ratchet ceiling for advance_recovery/chargebacks not in lines.
export default {
  name: "verify:verify-settlement-line-totals",
  run(ctx) {
    ctx.run("node", ["scripts/verify-settlement-line-totals.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-settlement-line-totals.mjs"]);
  },
};
