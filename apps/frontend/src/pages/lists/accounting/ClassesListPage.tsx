import { classesCatalogClient } from "../../../api/catalogs-accounting";
import { AccountingCatalogListPage } from "./AccountingCatalogListPage";

export function ClassesListPage() {
  return (
    <AccountingCatalogListPage
      client={classesCatalogClient}
      displayName="Classes"
      breadcrumbPath="Lists & Catalogs / Accounting / Classes"
      metadataSummary={(row) => row.description || "Class mapping"}
    />
  );
}
