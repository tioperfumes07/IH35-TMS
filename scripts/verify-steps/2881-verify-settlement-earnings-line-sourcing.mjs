// verify-settlement-earnings-line-sourcing — ACCT-F206.
//
// Two defects in appendSettlementLineFromDriverBillIfMissing, the leg that decides whether a driver is
// paid at all.
//
// 1. IT COULD PAY FROM A VOIDED BILL. The lookup took the newest driver_bills row with no status test,
//    and voiding is a status flip that does NOT move created_at — so the moment a load's most recent
//    bill was voided and not replaced, the driver's earnings line would be built from a payable the
//    company had revoked. Prod's three double-billed loads happen to carry the void one FIRST, so the
//    ordering saved it by accident. An accident is not a control.
//
// 2. IT RETURNED SILENTLY WHEN THERE WAS NO BILL — a bare `return`, in a close path whose other two
//    legs both call recordPostingFlagSkip precisely "so the settlement close is never a silent no-op on
//    this leg". The earnings leg, the one that matters most, was the only silent one. Measured on prod:
//    settlements d3ff8ea3 and c7422acc are both status='closed' with ZERO settlement_lines, for loads
//    that never got a driver bill. The driver worked the load, is marked settled, was paid nothing, and
//    nothing recorded why.
//
// The guard asserts BOTH halves independently, because either one alone still leaves a driver mispaid,
// and the selftest runs first so a guard that has stopped being able to fail is caught rather than
// trusted.
export default {
  name: "verify:settlement-earnings-line-sourcing",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-settlement-earnings-line-sourcing.mjs", "--selftest"]);
    return ctx.run("node", ["scripts/verify-settlement-earnings-line-sourcing.mjs"]);
  },
};
