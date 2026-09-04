export default {
  name: "verify-invoice-display-id-shape-matches-db-constraint",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-invoice-display-id-shape-matches-db-constraint.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-invoice-display-id-shape-matches-db-constraint.mjs"]);
  },
};
