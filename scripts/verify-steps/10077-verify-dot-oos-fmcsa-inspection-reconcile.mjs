/** GO-1405 P0 -- dot_oos derives from safety.dot_inspections, out_of_service unified to it. */
export default {
  name: "verify-dot-oos-fmcsa-inspection-reconcile",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-dot-oos-fmcsa-inspection-reconcile.mjs"]);
    await ctx.run("node", ["scripts/verify-dot-oos-fmcsa-inspection-reconcile.mjs", "--selftest"]);
  },
};
