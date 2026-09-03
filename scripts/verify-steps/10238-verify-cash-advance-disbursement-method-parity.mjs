/** GO-21 B8 — cash-advance disbursement_method must be the same set across every backend +
 * frontend surface. Fixed the "comchek" gap live 2026-09-03 (PR #19969); this keeps it from
 * silently regressing (one method added to a schema but forgotten in a dropdown, or vice versa). */
export default {
  name: "verify-cash-advance-disbursement-method-parity",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-cash-advance-disbursement-method-parity.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-cash-advance-disbursement-method-parity.mjs"]);
  },
};
