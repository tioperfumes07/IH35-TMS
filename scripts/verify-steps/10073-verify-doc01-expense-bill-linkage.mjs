/** DOC-01 D2 slice 5 — expense/bill docs.file_links widen (additive, no new columns). */
export default {
  name: "verify-doc01-expense-bill-linkage",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-doc01-expense-bill-linkage.mjs"]);
    await ctx.run("node", ["scripts/verify-doc01-expense-bill-linkage.mjs", "--selftest"]);
  },
};
