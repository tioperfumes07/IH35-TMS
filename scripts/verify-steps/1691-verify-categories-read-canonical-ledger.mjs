/** LST-PICKER-02 — an expense category IS a GL account; the picker must read catalogs.accounts. */
export default {
  name: "verify-categories-read-canonical-ledger",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-categories-read-canonical-ledger.mjs"]);
    await ctx.run("node", ["scripts/verify-categories-read-canonical-ledger.mjs", "--selftest"]);
  },
};
