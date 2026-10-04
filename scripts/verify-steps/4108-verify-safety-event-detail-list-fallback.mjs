export default {
  name: "verify-safety-event-detail-list-fallback",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-safety-event-detail-list-fallback.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-safety-event-detail-list-fallback.mjs"]);
    // BANK-F91490 — TripPairingBoard leftover muted refuse (10497 is ODD; leftover now on this EVEN host).
    await ctx.run("node", ["scripts/verify-trip-type-local-enum.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-trip-type-local-enum.mjs"]);
  },
};
