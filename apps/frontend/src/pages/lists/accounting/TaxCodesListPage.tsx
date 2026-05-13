import { taxCodesCatalogClient } from "../../../api/catalogs-accounting";
import { AccountingCatalogListPage } from "./AccountingCatalogListPage";

export function TaxCodesListPage() {
  return (
    <AccountingCatalogListPage
      client={taxCodesCatalogClient}
      displayName="Tax Codes"
      breadcrumbPath="Lists & Catalogs / Accounting / Tax Codes"
      metadataFields={[
        {
          key: "qbo_tax_code_id",
          label: "QBO tax code id (optional)",
          type: "text",
          required: false,
        },
      ]}
      metadataSummary={(row) => (row.metadata.qbo_tax_code_id ? `QBO: ${String(row.metadata.qbo_tax_code_id)}` : "")}
    />
  );
}
