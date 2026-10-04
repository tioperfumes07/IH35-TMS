export default {
  name: "verify-saf-harsh-event-clips-query-error-surface",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-saf-harsh-event-clips-query-error-surface.mjs"]);
    // BANK-F91498 — TireWear leftover fontSize: 10 refuse (cap-12 guard is not a verify-step; leftover now on this EVEN host).
    await ctx.run("node", ["scripts/verify-cap-12-tire-tread.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-cap-12-tire-tread.mjs"]);
  },
};
