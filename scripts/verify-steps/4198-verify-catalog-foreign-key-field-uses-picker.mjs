// verify-steps wrapper for scripts/verify-catalog-foreign-key-field-uses-picker.mjs
// (Lists picker-law audit, static-discovered 2026-08-21 while cross-referencing lists.required.json's
// ~86 picker_law leaves against the shared GenericCatalogPage/CatalogEditModal machinery: the
// "foreign_key" CatalogFieldType rendered a bare <input type="text"> demanding a hand-typed raw FK
// UUID, even though field.foreignKey already carries {catalogName, labelField, valueField}. No
// catalog currently declares a foreign_key field (0 live call sites, confirmed by grep), so this was
// not yet live-reachable — fixed anyway so item-9 holds the moment any catalog does. Fixed by
// rendering a real Combobox sourced from useCatalogQuery(foreignKey.catalogName)), verify-step 4198,
// Rule 37 claim-then-author pattern (claim shipped in #13597). Static, no DB.
export default {
  name: "verify-catalog-foreign-key-field-uses-picker",
  run(ctx) {
    ctx.run("node", ["scripts/verify-catalog-foreign-key-field-uses-picker.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-catalog-foreign-key-field-uses-picker.mjs"]);
  },
};
