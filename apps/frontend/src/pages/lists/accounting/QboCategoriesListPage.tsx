import { qboCategoriesCatalogClient } from "../../../api/catalogs-accounting";
import { AccountingCatalogListPage } from "./AccountingCatalogListPage";

export function QboCategoriesListPage() {
  return (
    <AccountingCatalogListPage
      client={qboCategoriesCatalogClient}
      displayName="QBO Categories"
      breadcrumbPath="Lists & Catalogs / Accounting / QBO Categories"
      metadataSummary={(row) => row.description || "QuickBooks category mapping"}
    />
  );
}
