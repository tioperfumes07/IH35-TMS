// verify-delivery-latch-pings-settlement — ACCT-F166-LATCH-SETTLEMENT-PAIR.
//
// A delivery has TWO money halves. latchOnDeliveryEvidence recognises the revenue;
// pingSettlementOnLoadEvent on `delivered_pending_docs` calls closeSettlementForFinalLoad, which closes
// the driver's trip settlement. Measured on main 2026-08-08, FOUR of the five production latch paths
// fired the first and never the second — the office status fallback, the driver route, bulk
// "Mark delivered", and the driver's own PWA departure tap. Revenue on the books; the settlement that
// pays the driver left OPEN FOREVER, on every path but one.
//
// verify-delivery-evidence-latch-wired was GREEN throughout — correctly, because it only ever asked
// about ONE half. That is the fourth money defect of the same family in a single day: a side-effect that
// did not reach one of its two halves. Hence this step: ASSERT THE PAIR, NOT THE CALL.
//
// Selftest first — it plants the real defect (latch without ping) and demands RED, and it also demands
// RED for a COMMENTED-OUT ping, because a comment-only "fix" is the failure mode money guards keep having
// to defend against. My own first draft accepted one; the selftest caught it.
export default {
  name: "verify:delivery-latch-pings-settlement",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-delivery-latch-pings-settlement.mjs", "--selftest"]);
    return ctx.run("node", ["scripts/verify-delivery-latch-pings-settlement.mjs"]);
  },
};
