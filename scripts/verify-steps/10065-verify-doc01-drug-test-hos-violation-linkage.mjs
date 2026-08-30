/** DOC-01 D2/D3 slice 3 — drug_test/hos_violation doc columns + docs.file_links widen. */
export default {
  name: "verify-doc01-drug-test-hos-violation-linkage",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-doc01-drug-test-hos-violation-linkage.mjs"]);
    await ctx.run("node", ["scripts/verify-doc01-drug-test-hos-violation-linkage.mjs", "--selftest"]);
  },
};
