/** WAVE-H1 — entity-scoped catalog/CoA completeness (CLS-ECON-EMPTY). */
export default {
  name: "verify-wave-h1-catalog-coa-completeness",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-wave-h1-catalog-coa-completeness.mjs"]);
    await ctx.run("node", ["scripts/verify-wave-h1-catalog-coa-completeness.mjs", "--selftest"]);
    // ECON-012 companion — expense_categories ↔ expense_category_account_map (no new claim).
    await ctx.run("node", ["scripts/verify-econ-012-expense-category-map-align.mjs"]);
    await ctx.run("node", ["scripts/verify-econ-012-expense-category-map-align.mjs", "--selftest"]);
  },
};
