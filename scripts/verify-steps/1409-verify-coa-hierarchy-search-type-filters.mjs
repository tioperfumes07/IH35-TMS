/** Cursor lane — CoA parent/child hierarchy + mid search + type filters (QBO parity). */
export default {
  name: "verify-coa-hierarchy-search-type-filters",
  run(ctx) {
    ctx.run("node", ["scripts/verify-coa-hierarchy-search-type-filters.mjs"]);
  },
};
