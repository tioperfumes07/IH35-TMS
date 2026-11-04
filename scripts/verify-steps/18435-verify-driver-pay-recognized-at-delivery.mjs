// 18435-verify-driver-pay-recognized-at-delivery — LEAD 443.116 #2 + (c) CORRECTION (claimed in #26666).
// Locked design READ-FIRST §3: the driver bill is due on the projected delivery; driver pay is recognized once, at delivery,
// and settlement close applies to that bill (never re-posts the pay); a settlement void keeps the delivery bill.
export default {
  name: "verify-driver-pay-recognized-at-delivery",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-driver-pay-recognized-at-delivery.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-driver-pay-recognized-at-delivery.mjs"]);
    // LEAD 443.269-B: a miles re-price restates the recognized pay everywhere (bill, A/P + GL, open pre-settlement).
    await ctx.run("node", ["scripts/verify-miles-reprice-follows-everywhere.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-miles-reprice-follows-everywhere.mjs"]);
    // Rows 85 / 24 / 98 (2026-11-03): one accrual eligibility (open unposted settlements accrue), empty close refused by
    // name, company settlement takes its driver settlement's number at close.
    await ctx.run("node", ["scripts/verify-rows-85-24-98.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-rows-85-24-98.mjs"]);
    // Rows 94 / 124 (ACCT-F11065, 2026-11-03): every driver bill carries its load's delivery date as due date; a
    // practical-miles bill never accrues and the posted strays void through the bill void engine; live_load_number is
    // never the load's own number.
    await ctx.run("node", ["scripts/verify-rows-94-124.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-rows-94-124.mjs"]);
  },
};
