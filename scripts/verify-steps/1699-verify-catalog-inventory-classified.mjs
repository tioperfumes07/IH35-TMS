/** LST-ORPH-05 — every routed catalog must be classified, and a RETIRE catalog must never regain a route. */
export default {
  name: "verify-catalog-inventory-classified",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-catalog-inventory-classified.mjs"]);
    await ctx.run("node", ["scripts/verify-catalog-inventory-classified.mjs", "--selftest"]);
  },
};
