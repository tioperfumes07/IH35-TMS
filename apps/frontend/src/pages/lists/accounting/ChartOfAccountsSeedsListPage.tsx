import { chartOfAccountsSeedsCatalogClient } from "../../../api/catalogs-accounting";
import { AccountingCatalogListPage } from "./AccountingCatalogListPage";

export function ChartOfAccountsSeedsListPage() {
  return (
    <AccountingCatalogListPage
      client={chartOfAccountsSeedsCatalogClient}
      displayName="Chart of Accounts Seeds"
      breadcrumbPath="Lists & Catalogs / Accounting / Chart of Accounts Seeds"
      codeLabel="Account code"
      metadataFields={[
        {
          key: "account_type",
          label: "Account Type",
          type: "select",
          required: true,
          options: [
            { value: "Asset", label: "Asset" },
            { value: "Liability", label: "Liability" },
            { value: "Equity", label: "Equity" },
            { value: "Income", label: "Income" },
            { value: "Expense", label: "Expense" },
          ],
        },
      ]}
      metadataSummary={(row) => `Type: ${String(row.metadata.account_type ?? "—")}`}
    />
  );
}
