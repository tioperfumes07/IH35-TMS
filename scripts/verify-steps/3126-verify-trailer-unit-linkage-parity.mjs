/**
 * CLAIMED 3126 — Cursor EVEN — verify-trailer-unit-linkage-parity
 * (trailer≡unit + load↔trip-event linkage)
 */
export default {
  name: "verify-trailer-unit-linkage-parity",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-trailer-unit-linkage-parity.mjs"]);
  },
};
