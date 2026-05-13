import { currencyCodesCatalogClient } from "../../../api/catalogs-accounting";
import { AccountingCatalogListPage } from "./AccountingCatalogListPage";

export function CurrencyCodesListPage() {
  return (
    <AccountingCatalogListPage
      client={currencyCodesCatalogClient}
      displayName="Currency Codes"
      breadcrumbPath="Lists & Catalogs / Accounting / Currency Codes"
      metadataFields={[
        {
          key: "iso_numeric",
          label: "ISO numeric (optional)",
          type: "text",
          required: false,
        },
      ]}
      metadataSummary={(row) => (row.metadata.iso_numeric ? `ISO #: ${String(row.metadata.iso_numeric)}` : "")}
    />
  );
}
