/** SAF-ORPH-03 — Forfeiture Audit panel escrow timeline must not 42703 or swallow errors. */
export default {
  name: "verify-safety-orph03-forfeiture-audit-timeline",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-safety-orph03-forfeiture-audit-timeline.mjs"]);
    await ctx.run("node", ["scripts/verify-safety-orph03-forfeiture-audit-timeline.mjs", "--selftest"]);
  },
};
