/** DOC-01 D2/D3 slice 4 — dot_inspection FK + fuel_transaction doc column + file_links widen. */
export default {
  name: "verify-doc01-dot-inspection-fuel-transaction-linkage",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-doc01-dot-inspection-fuel-transaction-linkage.mjs"]);
    await ctx.run("node", ["scripts/verify-doc01-dot-inspection-fuel-transaction-linkage.mjs", "--selftest"]);
  },
};
