import { postingTemplatesCatalogClient } from "../../../api/catalogs-accounting";
import { AccountingCatalogListPage } from "./AccountingCatalogListPage";

export function PostingTemplatesListPage() {
  return (
    <AccountingCatalogListPage
      client={postingTemplatesCatalogClient}
      displayName="Posting Templates"
      breadcrumbPath="Lists & Catalogs / Accounting / Posting Templates"
      readOnly
      metadataSummary={(row) => row.description || "Code-managed posting template"}
    />
  );
}
