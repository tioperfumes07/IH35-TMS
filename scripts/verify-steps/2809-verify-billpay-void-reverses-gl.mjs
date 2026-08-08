// verify-billpay-void-reverses-gl — ACCT-F175.
// voidBillPayment (the entry point behind POST /accounting/bill-payments/:id/void, i.e. the one the UI
// calls) hardcoded reversePostedGl: false, so voiding a bill payment reversed NOTHING while the void
// panel promised an equal-and-opposite entry. Live on prod: payment 8b68a9d7 ($33.40) voided
// 2026-08-07 02:48:58, only journal entry still DR 2000 A/P / CR 1295 Relay Fuel Wallet. The guard
// asserts the hardcoded opt-out is gone AND that the decision still keys on
// settlement_deduction_noncash — reversing unconditionally is the opposite defect, because a non-cash
// settlement deduction has no GL of its own. Selftest first, including a mutation of the real file.
export default {
  name: "verify:billpay-void-reverses-gl",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-billpay-void-reverses-gl.mjs"]);
  },
};
