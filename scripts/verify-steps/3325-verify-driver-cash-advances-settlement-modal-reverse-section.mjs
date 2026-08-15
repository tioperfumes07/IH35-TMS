// LINK-F5185 / LINK-F5171 — settlements reverse cluster (cash_advances, drawer.advance_detail,
// modal.mark_disbursed, modal.hold_deduction, modal.liability_breakdown, panel.pay_run_close)
// (verify-step 3325 — CC-1 band, claimed in commit CLAIM-RESERVE verify-step 3325).
export default {
  name: "driver-cash-advances-settlement-modal-reverse-section",
  run(ctx) {
    ctx.run("node", ["scripts/verify-driver-cash-advances-settlement-modal-reverse-section.mjs", "--selftest"]);
    return ctx.run("node", ["scripts/verify-driver-cash-advances-settlement-modal-reverse-section.mjs"]);
  },
};
