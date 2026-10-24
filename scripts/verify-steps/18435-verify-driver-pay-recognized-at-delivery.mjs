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
  },
};
