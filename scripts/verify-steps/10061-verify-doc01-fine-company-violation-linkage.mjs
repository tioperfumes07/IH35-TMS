/** DOC-01 D2 slice 2 — fine/company_violation docs.file_links widen + linkage sync. */
export default {
  name: "verify-doc01-fine-company-violation-linkage",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-doc01-fine-company-violation-linkage.mjs"]);
    await ctx.run("node", ["scripts/verify-doc01-fine-company-violation-linkage.mjs", "--selftest"]);
  },
};
