/** F9-04/05 — bill_unit_allocation recompute supersedes, never DELETE. */
export default {
  name: "verify-bill-unit-allocation-recompute-atomic",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-bill-unit-allocation-recompute-atomic.mjs"]);
    await ctx.run("node", ["scripts/verify-bill-unit-allocation-recompute-atomic.mjs", "--selftest"]);
  },
};
