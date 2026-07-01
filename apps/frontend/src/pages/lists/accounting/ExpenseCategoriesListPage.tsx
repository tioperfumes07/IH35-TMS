import { expenseCategoriesCatalogClient } from "../../../api/catalogs-accounting";
import { AccountingCatalogListPage } from "./AccountingCatalogListPage";

export function ExpenseCategoriesListPage() {
  return (
    <AccountingCatalogListPage
      client={expenseCategoriesCatalogClient}
      displayName="Expense Categories"
      breadcrumbPath="Lists & Catalogs / Accounting / Expense Categories"
      helperLink={{
        note: "Each category resolves to a GL account via the expense-category map — the map is the account link; this catalog is the bucket.",
        label: "Open Expense Category → GL account map",
        to: "/accounting/settings/expense-category-map",
      }}
    />
  );
}
