import { expenseCategoriesCatalogClient } from "../../../api/catalogs-accounting";
import { AccountingCatalogListPage } from "./AccountingCatalogListPage";

export function ExpenseCategoriesListPage() {
  return (
    <AccountingCatalogListPage
      client={expenseCategoriesCatalogClient}
      displayName="Expense Categories"
      breadcrumbPath="Lists & Catalogs / Accounting / Expense Categories"
    />
  );
}
