import { postingTemplatesCatalogClient } from "../../../api/catalogs-accounting";
import { AccountingCatalogListPage } from "./AccountingCatalogListPage";

export function PostingTemplatesListPage() {
  // ACCT-LINK-05: catalog was readOnly while empty — owners must be able to seed
  // PostingSourceType (+ fuel_event) rows in-app (debit/credit CoA picks). Writers already
  // stamp posting_template_id once a matching active per-entity template exists.
  return (
    <AccountingCatalogListPage
      client={postingTemplatesCatalogClient}
      displayName="Posting Templates"
      breadcrumbPath="Lists & Catalogs / Accounting / Posting Templates"
      metadataSummary={(row) => row.description || "Code-managed posting template"}
    />
  );
}
