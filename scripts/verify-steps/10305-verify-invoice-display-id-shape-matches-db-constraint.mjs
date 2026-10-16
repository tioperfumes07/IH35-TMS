export default {
  name: "verify-invoice-display-id-shape-matches-db-constraint",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-invoice-display-id-shape-matches-db-constraint.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-invoice-display-id-shape-matches-db-constraint.mjs"]);
    // LEAD 443.151 (b) — a voided invoice releases its number ("-V<n>") so the reissue keeps the Faro number.
    await ctx.run("node", ["scripts/verify-invoice-void-frees-number.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-invoice-void-frees-number.mjs"]);
  },
};
