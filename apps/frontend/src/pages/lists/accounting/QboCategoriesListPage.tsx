import { qboCategoriesCatalogClient } from "../../../api/catalogs-accounting";
import { AccountingCatalogListPage } from "./AccountingCatalogListPage";

// Renamed "QBO Categories" → "Product & Service Categories" (Block 3): this catalog IS the QBO
// Products & Services *category* concept — it groups items for sales reporting and does NOT post to
// GL. catalogKey (qbo-categories) and the route stay for back-compat. Parent/sub-category nesting
// (self-FK) is a separate [HOLD-FOR-JORGE — TIER 1] sub-block: catalogs.qbo_categories has no
// parent_category_id column yet.
export function QboCategoriesListPage() {
  return (
    <AccountingCatalogListPage
      client={qboCategoriesCatalogClient}
      displayName="Product & Service Categories"
      breadcrumbPath="Lists & Catalogs / Accounting / Product & Service Categories"
      metadataSummary={(row) => row.description || "Groups items for sales reporting (no GL account)"}
      helperLink={{
        note: "Categories group items for reporting; the item's income/expense account controls accounting — categories have no account link.",
        label: "Open Items",
        to: "/lists/accounting/items",
      }}
    />
  );
}
